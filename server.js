import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

// --- CLOUDINARY SETUP ---
import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';

dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5001;

// --- MIDDLEWARE ---
app.use((req, res, next) => {
  console.log(`\n🔥 ${new Date().toISOString()} - ${req.method} ${req.url}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('Body:', req.body);
  }
  next();
});

app.use(cors({
  origin: function(origin, callback) {
    console.log('🌐 CORS request from origin:', origin);
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3004',
      'https://ArtGalleryVake.github.io',
      'https://artgalleryvake.com',
      'https://backend3-nam9.onrender.com',
      'https://your-render-app.onrender.com'
    ];

    if (process.env.NODE_ENV !== 'production' || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ["GET", "POST", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- MULTER SETUP ---
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    console.log('🔍 File filter check:');
    console.log(' - Original name:', file.originalname);
    console.log(' - Mimetype:', file.mimetype);
    if (file.mimetype.startsWith('image/')) {
      console.log('✅ File accepted (image)');
      cb(null, true);
    } else {
      console.log('❌ File rejected (not an image)');
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// --- ROUTES ---

app.get("/", (req, res) => {
  console.log('🏠 Root route accessed');
  res.json({
    message: "Gallery Backend API is running ✅",
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

// FIXED: Upload file to Cloudinary with proper metadata handling
app.post("/upload", upload.single("file"), async (req, res) => {
  console.log('\n🚀 UPLOAD ENDPOINT HIT');

  if (req.fileValidationError) {
    console.error('❌ Multer fileValidationError:', req.fileValidationError);
    return res.status(400).json({ error: req.fileValidationError.message });
  }
  if (req.error) {
    console.error('❌ Multer error:', req.error);
    return res.status(400).json({ error: req.error.message });
  }
  if (!req.file) {
    console.log('❌ No file uploaded or Multer error occurred.');
    return res.status(400).json({ error: "File upload failed or no file provided." });
  }

  try {
    console.log('📥 After multer processing (in memory):');
    console.log(' - req.file exists:', !!req.file);
    console.log(' - req.body:', req.body);

    console.log('📄 File details (in memory):');
    console.log(' - Original name:', req.file.originalname);
    console.log(' - Size:', req.file.size, 'bytes');
    console.log(' - Mimetype:', req.file.mimetype);

    // FIXED: Ensure all form data is properly extracted and not empty
    const section = req.body.section || "others";
    const title = req.body.title?.trim() || "";
    const description = req.body.description?.trim() || "";
    const materials = req.body.materials?.trim() || "";
    const paintingSize = req.body.paintingSize?.trim() || "";

    console.log('📂 Target Cloudinary folder:', section);
    console.log('📝 Title:', `"${title}"`);
    console.log('📝 Description:', `"${description}"`);
    console.log('🎨 Materials:', `"${materials}"`);
    console.log('📏 Painting Size:', `"${paintingSize}"`);

    // FIXED: Prepare context with proper key-value pairs (Cloudinary context format)
    const contextData = {
      'title': title,
      'description': description,
      'uploadDate': new Date().toISOString(),
      'originalName': req.file.originalname,
      'section': section
    };

    // Add painting-specific fields to context if applicable
    if (section === "paintings") {
      contextData['materials'] = materials;
      contextData['paintingSize'] = paintingSize;
    }

    console.log('🏷️ Context data to be sent:', contextData);

    const cloudinaryOptions = {
      folder: section,
      public_id: `${Date.now()}-${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '-')}`,
      tags: [section, 'gallery-item'],
      context: contextData, // FIXED: Use the properly formatted context
      resource_type: 'image',
    };

    console.log('☁️ Uploading to Cloudinary with options:', cloudinaryOptions);

    const uploadResult = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        cloudinaryOptions,
        (error, result) => {
          if (error) {
            console.error('❌ Cloudinary upload error:', error);
            reject(error);
          } else {
            console.log('✅ Cloudinary upload success!');
            console.log('📋 Upload result context:', result.context);
            resolve(result);
          }
        }
      ).end(req.file.buffer);
    });

    console.log('☁️ Full Cloudinary upload result:', JSON.stringify(uploadResult, null, 2));

    if (!uploadResult) {
      console.error('❌ Upload result is missing!');
      return res.status(500).json({ error: "Cloudinary upload failed: No result returned." });
    }

    const secureUrl = uploadResult.secure_url || '';
    const publicId = uploadResult.public_id || '';
    const version = uploadResult.version || '';
    const format = uploadResult.format || '';
    
    // FIXED: Properly extract context data
    const uploadedContext = uploadResult.context || {};
    console.log('🏷️ Extracted context from upload result:', uploadedContext);

    const responseMetadata = {
      title: uploadedContext.title || title,
      description: uploadedContext.description || description,
      uploadDate: uploadedContext.uploadDate || uploadResult.created_at || new Date().toISOString(),
      originalName: uploadedContext.originalName || req.file.originalname,
      section: section,
      publicId: publicId,
      version: version,
      format: format,
    };

    // Add painting-specific fields safely
    if (section === "paintings") {
      responseMetadata.materials = uploadedContext.materials || materials;
      responseMetadata.paintingSize = uploadedContext.paintingSize || paintingSize;
    }

    console.log('📤 Response metadata:', responseMetadata);

    res.status(201).json({
      message: "File uploaded successfully to Cloudinary!",
      file: {
        filename: req.file.originalname,
        url: secureUrl,
        publicId: publicId,
        metadata: responseMetadata,
      },
      section: section,
    });

  } catch (error) {
    console.error('💥 Cloudinary Upload Error:', error);
    res.status(500).json({ error: "Cloudinary upload failed: " + error.message });
  }
});

// FIXED: Get files from Cloudinary with proper context handling
app.get("/files/:section", async (req, res) => {
  console.log(`📋 Getting files for section: ${req.params.section}`);
  const section = req.params.section;

  try {
    const result = await cloudinary.search
      .expression(`folder:${section}`)
      .sort_by('created_at', 'desc')
      .max_results(100)
      .with_field('context') // IMPORTANT: Request context field
      .execute();

    console.log(`☁️ Found ${result.resources.length} files in Cloudinary for section "${section}".`);

    const filesWithData = result.resources.map(resource => {
      console.log(`📄 Processing resource: ${resource.public_id}`);
      console.log('🏷️ Resource context:', resource.context);
      
      // FIXED: Properly handle context data
      const metadataFromContext = resource.context || {};
      
      const fileData = {
        filename: resource.original_filename || resource.public_id,
        url: resource.secure_url,
        publicId: resource.public_id,
        metadata: {
          title: metadataFromContext.title || '',
          description: metadataFromContext.description || '',
          uploadDate: metadataFromContext.uploadDate || resource.created_at,
          originalName: metadataFromContext.originalName || resource.original_filename,
          section: section,
          publicId: resource.public_id,
          version: resource.version,
          format: resource.format,
        },
        creationTime: new Date(resource.created_at)
      };

      // Add painting-specific fields if they exist in context
      if (section === "paintings") {
        fileData.metadata.materials = metadataFromContext.materials || '';
        fileData.metadata.paintingSize = metadataFromContext.paintingSize || '';
      }

      console.log(`📤 Processed file data:`, fileData.metadata);
      return fileData;
    });

    res.json({ files: filesWithData });

  } catch (error) {
    console.error("❌ Error getting files from Cloudinary:", error);
    if (error.http_code === 404) {
      res.status(404).json({ error: `Section "${section}" not found or has no files.` });
    } else {
      res.status(500).json({ error: "Could not get files from Cloudinary" });
    }
  }
});

// Delete file from Cloudinary
app.delete("/delete", async (req, res) => {
  console.log('🗑️ Delete request:', req.body);
  const { publicId, section } = req.body;

  if (!publicId) {
    console.log('❌ Missing publicId');
    return res.status(400).json({ error: "Public ID is required for deletion" });
  }

  try {
    console.log(`☁️ Deleting file with publicId: ${publicId} from section: ${section}`);
    
    const destroyResult = await cloudinary.uploader.destroy(publicId);

    console.log('☁️ Cloudinary destroy result:', destroyResult);

    if (destroyResult.result === 'ok') {
      res.json({ message: "File deleted successfully from Cloudinary" });
    } else if (destroyResult.result === 'not found') {
      res.status(404).json({ error: "File not found in Cloudinary" });
    } else {
      res.status(500).json({ error: "Cloudinary deletion failed with unknown status." });
    }

  } catch (err) {
    console.error("❌ Cloudinary Delete Error:", err);
    res.status(500).json({ error: "Could not delete file from Cloudinary" });
  }
});

// Get stats from Cloudinary
app.get("/stats", async (req, res) => {
  console.log('📊 Getting upload statistics from Cloudinary');
  const stats = {};

  try {
    const knownSections = ["paintings", "drawings", "illustrations", "authors", "exhibitions", "others"];

    for (const section of knownSections) {
      try {
        const result = await cloudinary.search
          .expression(`folder:${section}`)
          .max_results(1000)
          .execute();
        stats[section] = result.resources.length;
        console.log(` - Section "${section}": ${result.resources.length} assets`);
      } catch (sectionError) {
        console.error(`Error fetching stats for section "${section}":`, sectionError);
        stats[section] = 0; 
      }
    }
    
    console.log('Final Cloudinary stats:', stats);
    res.json({ stats });

  } catch (error) {
    console.error("❌ Cloudinary Stats Error:", error);
    res.status(500).json({ error: "Could not get stats from Cloudinary" });
  }
});

// --- ERROR HANDLING ---

app.use((error, req, res, next) => {
  console.error('💥 Global error handler:', error);
  if (error.error && error.error.message) {
    res.status(error.http_code || 500).json({ error: `Cloudinary API Error: ${error.error.message}` });
  } else {
    res.status(500).json({ error: 'Something went wrong!' });
  }
});

app.use((req, res) => {
  console.log('🔍 404 - Route not found:', req.method, req.url);
  res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Server started successfully!`);
  console.log(`🌐 Backend running on http://localhost:${PORT}`);
  console.log(`☁️ File uploads will be managed by Cloudinary`);
  console.log(`⏰ Started at: ${new Date().toISOString()}`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('📋 Available endpoints:');
  console.log(' - GET / (test)');
  console.log(' - GET /health (health check)');
  console.log(' - POST /upload (file upload to Cloudinary)');
  console.log(' - GET /files/:section (list files from Cloudinary)');
  console.log(' - DELETE /delete (delete file from Cloudinary)');
  console.log(' - GET /stats (upload statistics from Cloudinary)');
  console.log('\n');
});