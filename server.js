import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';
import slugify from 'slugify'; // Add this import

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// Use environment variable for port, fallback to 5001
const PORT = process.env.PORT || 5001;

// Enhanced logging middleware
app.use((req, res, next) => {
  console.log(`\n🔥 ${new Date().toISOString()} - ${req.method} ${req.url}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('Body:', req.body);
  }
  next();
});

// CORS configuration for production
app.use(cors({
  origin: function(origin, callback) {
    console.log('🌐 CORS request from origin:', origin);
    
    // Allow requests with no origin (like mobile apps, Postman)
    if (!origin) return callback(null, true);
    
    // Define allowed origins
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3004',
      'https://ArtGalleryVake.github.io', // Replace with YOUR GitHub username
      'https://backend3-nam9.onrender.com',
      'https://your-render-app.onrender.com' // Your Render app URL
    ];
    
    // In development, allow all origins
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    
    // In production, check against allowed origins
    if (allowedOrigins.includes(origin)) {
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

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- HELPER FUNCTIONS ---
const getMetadataPath = (imagePath) => {
  const parsedPath = path.parse(imagePath);
  return path.join(parsedPath.dir, parsedPath.name + '.json');
};

const saveMetadata = (imagePath, metadata) => {
  const metadataPath = getMetadataPath(imagePath);
  console.log('💾 Saving metadata to:', metadataPath);
  try {
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    console.log('✅ Metadata saved successfully.');
  } catch (error) {
    console.error('❌ Error saving metadata:', error);
  }
};

const loadMetadata = (imagePath) => {
  const metadataPath = getMetadataPath(imagePath);
  try {
    if (fs.existsSync(metadataPath)) {
      const data = fs.readFileSync(metadataPath, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('❌ Error loading metadata:', error);
  }
  return null;
};

// Helper function to create slugs (same as frontend)
const createSlug = (text) => {
  if (!text) return '';
  return simpleSlugify(text, {
    lower: true,
    strict: false,
    remove: /[*+~.()'"!:@„""`']/g,
    replacement: '-',
    trim: true,
    locale: 'ka'
  });
};

// Helper function to create unique painting slug (same logic as frontend)
const createUniquePaintingSlug = (file, filename) => {
  const title = file.metadata?.title;
  
  if (title) {
    // Use title + filename (without extension) to ensure uniqueness
    const filenameWithoutExt = filename ? filename.split('.')[0] : 'unknown';
    return createSlug(`${title}-${filenameWithoutExt}`);
  } else {
    // Fallback to filename-based slug
    return filename ? createSlug(filename.split('.')[0]) : 'unknown';
  }
};

// --- FILE STORAGE SETUP ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tempUploadPath = path.join(__dirname, "uploads", "temp");
    console.log('📁 Setting up temporary file destination:', tempUploadPath);
    try {
      fs.mkdirSync(tempUploadPath, { recursive: true });
      console.log('✅ Temp directory created/verified');
      cb(null, tempUploadPath);
    } catch (error) {
      console.error('❌ Error creating temp directory:', error);
      cb(error, null);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const filename = uniqueSuffix + path.extname(file.originalname);
    console.log('📄 Generated filename:', filename);
    cb(null, filename);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
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

// Health check endpoint (useful for monitoring)
app.get("/health", (req, res) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

// Upload file with metadata support
app.post("/upload", upload.single("file"), (req, res) => {
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
    console.log('📥 After multer processing:');
    console.log(' - req.file exists:', !!req.file);
    console.log(' - req.body:', req.body);

    console.log('📄 File details:');
    console.log(' - Original name:', req.file.originalname);
    console.log(' - Filename:', req.file.filename);
    console.log(' - Size:', req.file.size, 'bytes');
    console.log(' - Mimetype:', req.file.mimetype);
    console.log(' - Current path (temp):', req.file.path);

    const section = req.body.section || "others";
    const title = req.body.title || "";
    const description = req.body.description || "";
    const materials = req.body.materials || "";
    const paintingSize = req.body.paintingSize || "";

    console.log('📂 Target section:', section);
    console.log('📝 Title:', title);
    console.log('📝 Description:', description);
    console.log('🎨 Materials:', materials);
    console.log('📏 Painting Size:', paintingSize);

    const tempPath = req.file.path;
    const finalDir = path.join(__dirname, "uploads", section);
    console.log('📁 Creating final section directory:', finalDir);

    fs.mkdirSync(finalDir, { recursive: true });
    console.log('✅ Section directory ready');

    const finalPath = path.join(finalDir, req.file.filename);
    console.log('🔄 Moving file from:', tempPath);
    console.log(' to:', finalPath);

    fs.renameSync(tempPath, finalPath);
    console.log('✅ File moved successfully');

    // Create metadata object - always include all fields
    const metadata = {
      title: title,
      description: description,
      uploadDate: new Date().toISOString(),
      originalName: req.file.originalname,
      section: section
    };
    
    // Always add painting-specific fields for paintings section
    if (section === "paintings") {
      metadata.materials = materials;
      metadata.paintingSize = paintingSize;
    }
    
    // Save metadata if any field has content OR if it's a painting (to maintain structure)
    if (title || description || materials || paintingSize || section === "paintings") {
      console.log('💾 Saving metadata:', metadata);
      saveMetadata(finalPath, metadata);
    }

    // Construct the URL for the file
    const fileUrl = `/uploads/${section}/${req.file.filename}`;

    console.log('📤 Sending success response');
    console.log('File URL:', fileUrl);

    // Create metadata object for response
    const responseMetadata = {
      title,
      description,
      uploadDate: new Date().toISOString(),
      originalName: req.file.originalname,
      section: section
    };
    
    // Add painting-specific fields to response
    if (section === "paintings") {
      responseMetadata.materials = materials;
      responseMetadata.paintingSize = paintingSize;
    }

    res.status(201).json({
      message: "File uploaded successfully!",
      file: {
        filename: req.file.filename,
        url: fileUrl,
        path: finalPath,
        metadata: responseMetadata
      },
      section: section,
    });

  } catch (error) {
    console.error('💥 Upload processing error:', error);
    console.error('Error stack:', error.stack);
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
        console.log('🧹 Cleaned up temporary file:', req.file.path);
      } catch (cleanupError) {
        console.error('❌ Error during temp file cleanup:', cleanupError);
      }
    }
    res.status(500).json({ error: "Upload failed: " + error.message });
  }
});

// NEW ROUTE: Get individual painting/author/exhibition by slug
app.get("/:section/:slug", (req, res) => {
  console.log(`🎨 Getting individual item: ${req.params.section}/${req.params.slug}`);
  try {
    const { section, slug } = req.params;
    const sectionPath = path.join(__dirname, "uploads", section);
    
    console.log('Looking for item in:', sectionPath);
    console.log('Searching for slug:', slug);

    if (!fs.existsSync(sectionPath)) {
      console.log('📁 Section directory does not exist');
      return res.status(404).json({ error: 'Section not found' });
    }

    const allEntries = fs.readdirSync(sectionPath);
    let foundFile = null;

    for (const entryName of allEntries) {
      const entryPath = path.join(sectionPath, entryName);
      const stat = fs.statSync(entryPath);

      if (stat.isFile()) {
        const ext = path.extname(entryName).toLowerCase();
        if (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'].includes(ext)) {
          const metadata = loadMetadata(entryPath);
          
          // Create the same slug logic as frontend
          let itemSlug;
          if (section === 'paintings') {
            // For paintings, use the unique slug creation
            const fileData = { metadata, filename: entryName };
            itemSlug = createUniquePaintingSlug(fileData, entryName);
          } else if (section === 'authors') {
            // For authors, use title-based slug
            itemSlug = metadata?.title 
              ? createSlug(metadata.title)
              : "author-" + entryName;
          } else if (section === 'exhibitions') {
            // For exhibitions, use title-based slug
            itemSlug = metadata?.title
              ? createSlug(metadata.title)
              : "exhibition-" + entryName.split('.')[0];
          }

          console.log(`Comparing "${itemSlug}" with "${slug}"`);
          
          if (itemSlug === slug) {
            foundFile = {
              filename: entryName,
              url: `/uploads/${section}/${entryName}`,
              path: entryPath,
              metadata: metadata || {},
              creationTime: stat.birthtime || stat.mtime
            };
            console.log('✅ Found matching file:', foundFile);
            break;
          }
        }
      }
    }

    if (foundFile) {
      res.json({ file: foundFile });
    } else {
      console.log('❌ No file found matching slug:', slug);
      res.status(404).json({ error: 'Item not found' });
    }

  } catch (error) {
    console.error("❌ Error getting individual item:", error);
    res.status(500).json({ error: "Could not get item" });
  }
});

// Get files from a section with metadata AND creation time for sorting
app.get("/files/:section", (req, res) => {
  console.log(`📋 Getting files for section: ${req.params.section}`);
  try {
    const section = req.params.section;
    const sectionPath = path.join(__dirname, "uploads", section);
    console.log('Looking for files in:', sectionPath);

    if (!fs.existsSync(sectionPath)) {
      console.log('📁 Section directory does not exist');
      return res.json({ files: [] });
    }

    const allEntries = fs.readdirSync(sectionPath);
    const filesWithData = [];

    for (const entryName of allEntries) {
      const entryPath = path.join(sectionPath, entryName);
      const stat = fs.statSync(entryPath);

      if (stat.isFile()) {
        const ext = path.extname(entryName).toLowerCase();
        if (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'].includes(ext)) {
          const metadata = loadMetadata(entryPath);
          filesWithData.push({
            filename: entryName,
            url: `/uploads/${section}/${entryName}`,
            path: entryPath,
            metadata: metadata || {},
            creationTime: stat.birthtime || stat.mtime
          });
        }
      }
    }

    filesWithData.sort((a, b) => b.creationTime - a.creationTime);

    console.log(`📄 Found and sorted ${filesWithData.length} files`);
    res.json({ files: filesWithData });

  } catch (error) {
    console.error("❌ Error getting files:", error);
    res.status(500).json({ error: "Could not get files" });
  }
});

// Delete file and its metadata
app.delete("/delete", (req, res) => {
  console.log('🗑️ Delete request:', req.body);
  const { filename, section } = req.body;

  if (!filename || !section) {
    console.log('❌ Missing filename or section');
    return res.status(400).json({ error: "Filename and section are required" });
  }

  const filePath = path.join(__dirname, "uploads", section, filename);
  const metadataPath = getMetadataPath(filePath);

  console.log('Attempting to delete:', filePath);
  console.log('And metadata:', metadataPath);

  try {
    let deletedCount = 0;

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`✅ Image deleted: ${section}/${filename}`);
      deletedCount++;
    }

    if (fs.existsSync(metadataPath)) {
      fs.unlinkSync(metadataPath);
      console.log(`✅ Metadata deleted: ${section}/${filename}.json`);
      deletedCount++;
    }

    if (deletedCount > 0) {
      res.json({ message: "File deleted successfully" });
    } else {
      console.log('❌ File not found for deletion');
      res.status(404).json({ error: "File not found" });
    }

  } catch (err) {
    console.error("❌ Delete error:", err);
    res.status(500).json({ error: "Could not delete file" });
  }
});

// Get all sections and their file counts
app.get("/stats", (req, res) => {
  console.log('📊 Getting upload statistics');
  try {
    const uploadsPath = path.join(__dirname, "uploads");
    const stats = {};
    console.log('Checking uploads directory:', uploadsPath);

    if (fs.existsSync(uploadsPath)) {
      const sections = fs.readdirSync(uploadsPath).filter(item => {
        const itemPath = path.join(uploadsPath, item);
        const isDir = fs.statSync(itemPath).isDirectory();
        const notTemp = item !== 'temp';
        return isDir && notTemp;
      });

      console.log('Valid sections found:', sections);

      sections.forEach(section => {
        const sectionPath = path.join(uploadsPath, section);
        const allFiles = fs.readdirSync(sectionPath);
        const imageFiles = allFiles.filter(filename => {
          const ext = path.extname(filename).toLowerCase();
          return ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'].includes(ext);
        });
        stats[section] = imageFiles.length;
        console.log(` - ${section}: ${imageFiles.length} files`);
      });
    } else {
      console.log('❌ Uploads directory does not exist');
    }

    console.log('Final stats:', stats);
    res.json({ stats });

  } catch (error) {
    console.error("❌ Stats error:", error);
    res.status(500).json({ error: "Could not get stats" });
  }
});

// NEW ROUTE: Get individual painting/author/exhibition by slug (MOVED TO END)
app.get("/:section/:slug", (req, res) => {
  console.log(`🎨 Getting individual item: ${req.params.section}/${req.params.slug}`);
  try {
    const { section, slug } = req.params;
    const sectionPath = path.join(__dirname, "uploads", section);
    
    console.log('Looking for item in:', sectionPath);
    console.log('Searching for slug:', slug);

    if (!fs.existsSync(sectionPath)) {
      console.log('📁 Section directory does not exist');
      return res.status(404).json({ error: 'Section not found' });
    }

    const allEntries = fs.readdirSync(sectionPath);
    let foundFile = null;

    for (const entryName of allEntries) {
      const entryPath = path.join(sectionPath, entryName);
      const stat = fs.statSync(entryPath);

      if (stat.isFile()) {
        const ext = path.extname(entryName).toLowerCase();
        if (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'].includes(ext)) {
          const metadata = loadMetadata(entryPath);
          
          // Create the same slug logic as frontend
          let itemSlug;
          if (section === 'paintings') {
            // For paintings, use the unique slug creation
            const fileData = { metadata, filename: entryName };
            itemSlug = createUniquePaintingSlug(fileData, entryName);
          } else if (section === 'authors') {
            // For authors, use title-based slug
            itemSlug = metadata?.title 
              ? createSlug(metadata.title)
              : "author-" + entryName;
          } else if (section === 'exhibitions') {
            // For exhibitions, use title-based slug
            itemSlug = metadata?.title
              ? createSlug(metadata.title)
              : "exhibition-" + entryName.split('.')[0];
          }

          console.log(`Comparing "${itemSlug}" with "${slug}"`);
          
          if (itemSlug === slug) {
            foundFile = {
              filename: entryName,
              url: `/uploads/${section}/${entryName}`,
              path: entryPath,
              metadata: metadata || {},
              creationTime: stat.birthtime || stat.mtime
            };
            console.log('✅ Found matching file:', foundFile);
            break;
          }
        }
      }
    }

    if (foundFile) {
      res.json({ file: foundFile });
    } else {
      console.log('❌ No file found matching slug:', slug);
      res.status(404).json({ error: 'Item not found' });
    }

  } catch (error) {
    console.error("❌ Error getting individual item:", error);
    res.status(500).json({ error: "Could not get item" });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('💥 Global error handler:', error);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use((req, res) => {
  console.log('🔍 404 - Route not found:', req.method, req.url);
  res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Server started successfully!`);
  console.log(`🌐 Backend running on http://localhost:${PORT}`);
  console.log(`📁 File uploads will be saved to: ${path.join(__dirname, 'uploads')}`);
  console.log(`⏰ Started at: ${new Date().toISOString()}`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('📋 Available endpoints:');
  console.log(' - GET / (test)');
  console.log(' - GET /health (health check)');
  console.log(' - POST /upload (file upload with metadata)');
  console.log(' - GET /files/:section (list files with metadata)');
  console.log(' - GET /:section/:slug (get individual item by slug)'); // NEW!
  console.log(' - GET /stats (upload statistics)');
  console.log(' - DELETE /delete (delete file and metadata)');
  console.log('\n');
});