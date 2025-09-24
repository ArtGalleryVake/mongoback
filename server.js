import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs"; // For file system operations (like deleting files)
import path from "path";
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

// --- CONFIGURATION ---
// NOTE: Hardcoding credentials is NOT recommended for production.
// Consider using environment variables for security and flexibility.
const MONGODB_URI = "mongodb+srv://artgalleryvake_db_user:EaWuUVLQ1WCo0TZm@cluster0.0r7swvv.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const UPLOAD_FOLDER = 'uploads'; // Directory to store uploaded images on the server
const PORT = process.env.PORT || 5001;

// --- FILE SYSTEM SETUP ---
// Ensure the upload directory exists
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadDir = path.join(__dirname, UPLOAD_FOLDER);

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
  console.log(`✅ Created upload directory: ${uploadDir}`);
}

// --- MONGOOSE SETUP ---
mongoose.connect(MONGODB_URI) // useNewUrlParser and useUnifiedTopology are deprecated and not needed
.then(() => {
  console.log('🚀 Connected to MongoDB successfully!');
})
.catch(err => {
  console.error('❌ Error connecting to MongoDB:', err);
  process.exit(1); // Exit process if unable to connect to DB
});

// --- Mongoose Schema ---
const galleryItemSchema = new mongoose.Schema({
  section: { type: String, required: true, index: true },
  filePath: { type: String, required: true }, // Server's absolute path to the file
  filename: { type: String, required: true }, // Multer's generated filename
  originalName: { type: String, required: true }, // Original name of the uploaded file
  title: { type: String, trim: true },
  description: { type: String, trim: true },
  materials: { type: String, trim: true },
  paintingSize: { type: String, trim: true },
  uploadDate: { type: Date, default: Date.now },
}, { timestamps: true }); // Adds createdAt and updatedAt automatically

const GalleryItem = mongoose.model('GalleryItem', galleryItemSchema);

// --- EXPRESS APP SETUP ---
const app = express();

// --- MIDDLEWARE ---

// Request logger
app.use((req, res, next) => {
  console.log(`\n🔥 ${new Date().toISOString()} - ${req.method} ${req.url}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('Body:', req.body);
  }
  next();
});

// CORS Configuration - SIMPLIFIED AND FIXED
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:3004',
    'http://localhost:3006',
    'https://ArtGalleryVake.github.io',
    'https://artgalleryvake.github.io',
    'https://artgalleryvake.com',
    'https://www.artgalleryvake.com'
  ],
  methods: ["GET", "POST", "DELETE", "PUT", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

// Body parsing middleware with increased limits
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// FIXED: Serve static files with correct path
// Use UPLOAD_FOLDER constant instead of uploadDir variable
app.use(`/${UPLOAD_FOLDER}`, express.static(uploadDir));
console.log(`🚀 Serving static files from '/${UPLOAD_FOLDER}' directory`);

// --- MULTER SETUP FOR DISK STORAGE ---
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir); // Save files to the upload directory
  },
  filename: function (req, file, cb) {
    // Create a unique filename: timestamp-originalfilename.ext
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    // Clean original filename: replace spaces with underscores
    const safeOriginalName = file.originalname.replace(/\s+/g, '_');
    cb(null, uniqueSuffix + '-' + safeOriginalName);
  }
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

// Root route
app.get("/", (req, res) => {
  console.log('🏠 Root route accessed');
  res.json({
    message: "Gallery Backend API is running ✅",
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    corsInfo: "CORS properly configured for multiple origins"
  });
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1 ? "connected" : "disconnected"
  });
});

// DEBUG ENDPOINT TO CHECK CORS (useful for frontend debugging)
app.get("/debug-cors", (req, res) => {
  console.log('🔧 Debug CORS endpoint accessed');
  res.json({
    origin: req.get('origin'),
    host: req.get('host'),
    userAgent: req.get('user-agent'),
    referer: req.get('referer'),
    headers: req.headers,
    timestamp: new Date().toISOString()
  });
});

// STATS ENDPOINT - Provide gallery statistics
app.get("/stats", async (req, res) => {
  console.log('📊 Stats endpoint accessed');

  try {
    // Get counts by section
    const sections = await GalleryItem.aggregate([
      {
        $group: {
          _id: "$section",
          count: { $sum: 1 }
        }
      }
    ]);

    // Get total count
    const totalItems = await GalleryItem.countDocuments();

    // Get recent uploads (last 7 days)
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const recentUploads = await GalleryItem.countDocuments({
      uploadDate: { $gte: weekAgo }
    });

    // Get recent uploads (last 30 days)
    const monthAgo = new Date();
    monthAgo.setDate(monthAgo.getDate() - 30);
    const monthlyUploads = await GalleryItem.countDocuments({
      uploadDate: { $gte: monthAgo }
    });

    const stats = {
      totalItems,
      recentUploads,
      monthlyUploads,
      sections: sections.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      timestamp: new Date().toISOString()
    };

    console.log('✅ Stats retrieved successfully');
    res.json(stats);

  } catch (error) {
    console.error('❌ Error fetching stats:', error);
    res.status(500).json({
      error: "Could not retrieve stats.",
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});


// Upload endpoint: Saves file locally and to MongoDB
app.post("/upload", upload.single("file"), async (req, res) => {
  console.log('\n🚀 UPLOAD ENDPOINT HIT');

  // Multer error handling (if any)
  if (req.fileValidationError) {
    console.error('❌ Multer fileValidationError:', req.fileValidationError);
    return res.status(400).json({ error: req.fileValidationError.message });
  }
  if (req.error) { // Custom error set by multer config? Less common.
    console.error('❌ Multer error:', req.error);
    return res.status(400).json({ error: req.error.message });
  }
  if (!req.file) {
    console.log('❌ No file uploaded or Multer error occurred.');
    return res.status(400).json({ error: "File upload failed or no file provided." });
  }

  try {
    console.log('📥 File received and saved locally by Multer.');
    console.log(' - Saved path:', req.file.path);
    console.log(' - Original name:', req.file.originalname);
    console.log(' - Mimetype:', req.file.mimetype);
    console.log(' - Body Data:', req.body);

    // Extract metadata from request body
    const { section, title, description, materials, paintingSize } = req.body;

    // Create a new gallery item in MongoDB
    const newGalleryItem = new GalleryItem({
      section: section || "others", // Default section if not provided
      filePath: req.file.path, // Store the full path on the server
      filename: req.file.filename, // The name Multer gave it (e.g., 1678886400000-image.jpg)
      originalName: req.file.originalname, // The original name (e.g., my photo.jpg)
      title: title ? title.trim() : "",
      description: description ? description.trim() : "",
      materials: materials ? materials.trim() : "",
      paintingSize: paintingSize ? paintingSize.trim() : "",
    });

    await newGalleryItem.save();
    console.log(`✅ Gallery item saved to MongoDB with ID: ${newGalleryItem._id}`);

    // FIXED: Use UPLOAD_FOLDER constant for URL construction
    const fileUrl = `${req.protocol}://${req.get('host')}/${UPLOAD_FOLDER}/${req.file.filename}`;

    res.status(201).json({
      message: "File uploaded and saved successfully!",
      item: {
        _id: newGalleryItem._id,
        section: newGalleryItem.section,
        filename: newGalleryItem.filename,
        originalName: newGalleryItem.originalName,
        title: newGalleryItem.title,
        description: newGalleryItem.description,
        materials: newGalleryItem.materials,
        paintingSize: newGalleryItem.paintingSize,
        uploadDate: newGalleryItem.uploadDate,
        url: fileUrl // Provide the URL to access the image
      }
    });

  } catch (error) {
    console.error('💥 MongoDB Save or Upload Error:', error);
    // Clean up the partially uploaded file if saving to DB failed
    if (req.file && req.file.path) {
      fs.unlink(req.file.path, (unlinkErr) => {
        if (unlinkErr) console.error(`❌ Error cleaning up uploaded file ${req.file.path}:`, unlinkErr);
      });
    }
    res.status(500).json({
      error: "Failed to save file or its data.",
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get items from MongoDB based on section
app.get("/files/:section", async (req, res) => {
  const { section } = req.params;
  console.log(`📋 Getting files for section: ${section}`);

  if (!section) {
    return res.status(400).json({ error: "Section parameter is required.", timestamp: new Date().toISOString() });
  }

  try {
    const items = await GalleryItem.find({ section: section })
      .sort({ uploadDate: -1 }) // Sort by upload date, newest first
      .exec();

    console.log(`✅ Found ${items.length} items for section "${section}" in MongoDB.`);

    const filesWithData = items.map(item => {
      // FIXED: Use UPLOAD_FOLDER constant for URL construction
      const fileUrl = `${req.protocol}://${req.get('host')}/${UPLOAD_FOLDER}/${item.filename}`;

      return {
        _id: item._id,
        section: item.section,
        filename: item.filename,
        originalName: item.originalName,
        title: item.title,
        description: item.description,
        materials: item.materials,
        paintingSize: item.paintingSize,
        uploadDate: item.uploadDate,
        url: fileUrl // Provide the local URL
      };
    });

    res.json({ files: filesWithData });

  } catch (error) {
    console.error(`❌ Error fetching files from MongoDB for section "${section}":`, error);
    res.status(500).json({
      error: "Could not retrieve files.",
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get a single item by its MongoDB ID
app.get("/files/item/:id", async (req, res) => {
  const { id } = req.params;
  console.log(`📋 Getting single file by ID: ${id}`);

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Invalid ID format.", timestamp: new Date().toISOString() });
  }

  try {
    const item = await GalleryItem.findById(id).exec();

    if (!item) {
      console.log(`❌ Item with ID ${id} not found.`);
      return res.status(404).json({ error: "Item not found.", timestamp: new Date().toISOString() });
    }

    // FIXED: Use UPLOAD_FOLDER constant for URL construction
    const fileUrl = `${req.protocol}://${req.get('host')}/${UPLOAD_FOLDER}/${item.filename}`;

    res.json({
      _id: item._id,
      section: item.section,
      filename: item.filename,
      originalName: item.originalName,
      title: item.title,
      description: item.description,
      materials: item.materials,
      paintingSize: item.paintingSize,
      uploadDate: item.uploadDate,
      url: fileUrl
    });

  } catch (error) {
    console.error(`❌ Error fetching item with ID ${id} from MongoDB:`, error);
    res.status(500).json({
      error: "Could not retrieve item.",
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Delete file from local storage and MongoDB
app.delete("/delete/:id", async (req, res) => {
  const { id } = req.params;
  console.log(`🗑️ Delete request for item ID: ${id}`);

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Invalid ID format.", timestamp: new Date().toISOString() });
  }

  try {
    // Find the item first to get the filePath
    const item = await GalleryItem.findById(id).exec();

    if (!item) {
      console.log(`❌ Item with ID ${id} not found in MongoDB.`);
      return res.status(404).json({ error: "Item not found.", timestamp: new Date().toISOString() });
    }

    const filePathToDelete = item.filePath;
    const filenameToDelete = item.filename;

    // Delete from MongoDB
    await GalleryItem.findByIdAndDelete(id).exec(); // Use await
    console.log(`✅ Item ${id} deleted from MongoDB.`);

    // Delete from local filesystem
    fs.unlink(filePathToDelete, (err) => {
      if (err) {
        console.error(`❌ Error deleting file ${filenameToDelete}:`, err);
        // Return success for DB deletion, but warn about file deletion failure
        return res.status(200).json({
          message: "Item deleted from database. However, file deletion failed.",
          warning: `Could not delete local file: ${err.message}`,
          timestamp: new Date().toISOString()
        });
      }
      console.log(`✅ File ${filenameToDelete} deleted from filesystem.`);
      res.json({ message: "File and its data deleted successfully.", timestamp: new Date().toISOString() });
    });

  } catch (error) {
    console.error(`💥 Error during deletion for item ID ${id}:`, error);
    res.status(500).json({
      error: "Could not delete file or its data.",
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Update Endpoint
app.put("/update/:id", upload.single("file"), async (req, res) => {
  const { id } = req.params;
  console.log(`🔄 Update request for item ID: ${id}`);

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Invalid ID format.", timestamp: new Date().toISOString() });
  }

  try {
    const { section, title, description, materials, paintingSize } = req.body;
    const updateData = {
      // Only include fields if they are provided in the request body
      ...(section !== undefined && { section: section.trim() }),
      ...(title !== undefined && { title: title.trim() }),
      ...(description !== undefined && { description: description.trim() }),
      ...(materials !== undefined && { materials: materials.trim() }),
      ...(paintingSize !== undefined && { paintingSize: paintingSize.trim() }),
    };

    // Handle new file upload
    if (req.file) {
      console.log('🔄 New file uploaded for update:', req.file.filename);
      const existingItem = await GalleryItem.findById(id).exec();
      if (!existingItem) {
        // Clean up the uploaded file if the item to update wasn't found
        fs.unlink(req.file.path, () => {});
        return res.status(404).json({ error: "Item to update not found.", timestamp: new Date().toISOString() });
      }

      // Delete the old file from the filesystem
      fs.unlink(existingItem.filePath, (err) => {
        if (err) console.error(`❌ Error deleting old file ${existingItem.filePath}:`, err);
      });

      // Add new file details to updateData
      updateData.filePath = req.file.path;
      updateData.filename = req.file.filename;
      updateData.originalName = req.file.originalname;
    }

    // If no fields to update and no file was uploaded, return early
    if (Object.keys(updateData).length === 0 && !req.file) {
      return res.status(400).json({ error: "No update data or file provided.", timestamp: new Date().toISOString() });
    }

    const updatedItem = await GalleryItem.findByIdAndUpdate(id, updateData, {
      new: true, // Return the updated document
      runValidators: true, // Ensure Mongoose validators are run
    }).exec();

    if (!updatedItem) {
      // Clean up uploaded file if item was not found for update
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(404).json({ error: "Item not found for update.", timestamp: new Date().toISOString() });
    }

    console.log(`✅ Item ${id} updated successfully.`);
    // FIXED: Use UPLOAD_FOLDER constant for URL construction
    const fileUrl = `${req.protocol}://${req.get('host')}/${UPLOAD_FOLDER}/${updatedItem.filename}`;

    res.json({
      message: "Item updated successfully!",
      item: {
        _id: updatedItem._id,
        section: updatedItem.section,
        filename: updatedItem.filename,
        originalName: updatedItem.originalName,
        title: updatedItem.title,
        description: updatedItem.description,
        materials: updatedItem.materials,
        paintingSize: updatedItem.paintingSize,
        uploadDate: updatedItem.uploadDate,
        url: fileUrl
      }
    });

  } catch (error) {
    console.error(`💥 Error during update for item ID ${id}:`, error);
    // If a file was uploaded during the update and an error occurred, clean it up.
    if (req.file) {
      fs.unlink(req.file.path, (unlinkErr) => {
        if (unlinkErr) console.error(`❌ Error cleaning up uploaded file after update error:`, unlinkErr);
      });
    }
    res.status(500).json({
      error: "Could not update item.",
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// --- Global Error Handling ---
app.use((error, req, res, next) => {
  console.error('💥 Global error handler:', error);

  // Specific CORS error handling
  if (error.message && error.message.includes('Not allowed by CORS')) {
    return res.status(403).json({
      error: 'CORS Error: Origin not allowed',
      origin: req.get('origin'),
      timestamp: new Date().toISOString()
    });
  }

  // Multer errors
  if (error instanceof multer.MulterError) {
    let errorMessage = `Multer error: ${error.message}`;
    if (error.code === 'LIMIT_FILE_SIZE') {
      errorMessage = `File too large. Maximum file size is 10MB.`;
    } else if (error.code === 'LIMIT_FILE_COUNT') {
      errorMessage = `Too many files uploaded.`;
    } else if (error.code === 'LIMIT_FIELD_COUNT') {
      errorMessage = `Too many fields.`;
    }
    return res.status(400).json({ error: errorMessage, timestamp: new Date().toISOString() });
  }

  // Mongoose validation errors
  if (error.name === 'ValidationError') {
    const messages = Object.values(error.errors).map(err => err.message);
    return res.status(400).json({ error: 'Validation Error', details: messages, timestamp: new Date().toISOString() });
  }

  // Mongoose CastError (e.g., invalid ID format)
  if (error.name === 'CastError') {
    return res.status(400).json({ error: 'Invalid ID format.', timestamp: new Date().toISOString() });
  }

  // Default to 500 for other errors
  res.status(error.http_code || error.status || 500).json({
    error: error.message || 'Something went wrong!',
    timestamp: new Date().toISOString()
  });
});

// --- 404 Not Found Handler ---
// This should be the last middleware
app.use((req, res) => {
  console.log('🔍 404 - Route not found:', req.method, req.url);
  res.status(404).json({
    error: 'Route not found',
    method: req.method,
    url: req.url,
    timestamp: new Date().toISOString()
  });
});

// --- SERVER START ---
app.listen(PORT, () => {
  console.log(`\n🚀 Server started successfully!`);
  console.log(`🌐 Backend running on http://localhost:${PORT}`);
  console.log(`💾 File storage managed by local filesystem ('${UPLOAD_FOLDER}') and MongoDB`);
  console.log(`⏰ Started at: ${new Date().toISOString()}`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('\n📋 Available endpoints:');
  console.log(' - GET / (test)');
  console.log(' - GET /health (health check)');
  console.log(' - GET /debug-cors (CORS debugging)');
  console.log(' - GET /stats (gallery statistics)');
  console.log(` - POST /upload (file upload to local storage '${UPLOAD_FOLDER}' & MongoDB)`);
  console.log(' - GET /files/:section (list items from MongoDB)');
  console.log(' - GET /files/item/:id (get single item by MongoDB ID)');
  console.log(' - PUT /update/:id (update item data and optionally file)');
  console.log(` - DELETE /delete/:id (delete item from MongoDB and local file in '${UPLOAD_FOLDER}')`);
  console.log(`\n🔒 CORS configured for GitHub Pages and other origins`);
  console.log('\n');
});