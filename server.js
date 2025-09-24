import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs"; // For file system operations (like deleting files)
import path from "path";
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

// --- CONFIGURATION (Hardcoded values) ---
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
mongoose.connect(MONGODB_URI, {
  // useNewUrlParser: true, // These are deprecated and not needed for newer Mongoose versions
  // useUnifiedTopology: true,
})
.then(() => {
  console.log('🚀 Connected to MongoDB successfully!');
})
.catch(err => {
  console.error('❌ Error connecting to MongoDB:', err);
  // Exit process if unable to connect to DB
  process.exit(1);
});

// Define a Mongoose Schema for gallery items
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
  // Add other relevant fields as needed
}, { timestamps: true }); // Adds createdAt and updatedAt automatically

const GalleryItem = mongoose.model('GalleryItem', galleryItemSchema);

// --- EXPRESS APP SETUP ---
const app = express();

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
    if (!origin) return callback(null, true); // Allow requests with no origin (like server-to-server)

    // Define allowed origins directly
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3004',
      'http://localhost:3006',
      'https://ArtGalleryVake.github.io',
      'https://artgalleryvake.com',
      'https://mongoback-hlx0.onrender.com', // Keep if this is your deployed backend
      'https://your-render-app.onrender.com' // Placeholder
    ];

    // In production, you might want to restrict this more tightly.
    // For development, allowing localhost is usually fine.
    if (process.env.NODE_ENV !== 'production' || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ["GET", "POST", "DELETE", "PUT"], // Added PUT for potential updates
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the upload directory
// This allows you to access images directly via a URL like /uploads/your-image.jpg
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
    // Remove spaces from filename and ensure valid characters
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

// Upload endpoint: Saves file locally and to MongoDB
app.post("/upload", upload.single("file"), async (req, res) => {
  console.log('\n🚀 UPLOAD ENDPOINT HIT');

  // Multer error handling (if any)
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
    console.log('📥 File received and saved locally by Multer.');
    console.log(' - Saved path:', req.file.path);
    console.log(' - Original name:', req.file.originalname);
    console.log(' - Mimetype:', req.file.mimetype);
    console.log(' - Body Data:', req.body);

    // Extract metadata from request body
    const { section, title, description, materials, paintingSize } = req.body;

    // Create a new gallery item in MongoDB
    const newGalleryItem = new GalleryItem({
      section: section || "others",
      filePath: req.file.path, // Store the full path on the server
      filename: req.file.filename, // The name Multer gave it
      originalName: req.file.originalname,
      title: title ? title.trim() : "",
      description: description ? description.trim() : "",
      materials: materials ? materials.trim() : "",
      paintingSize: paintingSize ? paintingSize.trim() : "",
    });

    await newGalleryItem.save();
    console.log('✅ Gallery item saved to MongoDB:', newGalleryItem._id);

    // Construct the URL for accessing the uploaded file via the static server
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
        if (unlinkErr) console.error('❌ Error cleaning up uploaded file:', unlinkErr);
      });
    }
    res.status(500).json({ error: "Failed to save file or its data." });
  }
});

// Get items from MongoDB based on section
app.get("/files/:section", async (req, res) => {
  const { section } = req.params;
  console.log(`📋 Getting files for section: ${section}`);

  if (!section) {
    return res.status(400).json({ error: "Section parameter is required." });
  }

  try {
    const items = await GalleryItem.find({ section: section })
      .sort({ uploadDate: -1 }) // Sort by upload date, newest first
      .exec();

    console.log(`✅ Found ${items.length} items for section "${section}" in MongoDB.`);

    const filesWithData = items.map(item => {
      // Construct the URL for accessing the image from the static file server
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
    console.error("❌ Error fetching files from MongoDB:", error);
    res.status(500).json({ error: "Could not retrieve files." });
  }
});

// Get a single item by its MongoDB ID
app.get("/files/item/:id", async (req, res) => {
  const { id } = req.params;
  console.log(`📋 Getting single file by ID: ${id}`);

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Invalid ID format." });
  }

  try {
    const item = await GalleryItem.findById(id).exec();

    if (!item) {
      return res.status(404).json({ error: "Item not found." });
    }

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
    res.status(500).json({ error: "Could not retrieve item." });
  }
});


// Delete file from local storage and MongoDB
app.delete("/delete/:id", async (req, res) => {
  const { id } = req.params;
  console.log(`🗑️ Delete request for item ID: ${id}`);

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Invalid ID format." });
  }

  try {
    // Find the item first to get the filePath
    const item = await GalleryItem.findById(id).exec();

    if (!item) {
      console.log(`❌ Item with ID ${id} not found in MongoDB.`);
      return res.status(404).json({ error: "Item not found." });
    }

    const filePathToDelete = item.filePath;
    const filenameToDelete = item.filename;

    // Delete from MongoDB
    const deletedItem = await GalleryItem.findByIdAndDelete(id).exec();
    console.log(`✅ Item ${id} deleted from MongoDB.`);

    // Delete from local filesystem
    fs.unlink(filePathToDelete, (err) => {
      if (err) {
        console.error(`❌ Error deleting file ${filePathToDelete}:`, err);
        // Decide how to handle this: maybe send a partial success or a warning
        return res.status(500).json({
          message: "Item deleted from DB, but failed to delete local file.",
          error: err.message
        });
      }
      console.log(`✅ File ${filenameToDelete} deleted from filesystem.`);
      res.json({ message: "File and its data deleted successfully." });
    });

  } catch (error) {
    console.error(`💥 Error during deletion for item ID ${id}:`, error);
    res.status(500).json({ error: "Could not delete file or its data." });
  }
});

// --- Update Endpoint (Optional but good to have) ---
app.put("/update/:id", upload.single("file"), async (req, res) => {
  const { id } = req.params;
  console.log(`🔄 Update request for item ID: ${id}`);

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Invalid ID format." });
  }

  try {
    const { section, title, description, materials, paintingSize } = req.body;
    const updateData = {
      section: section || undefined,
      title: title ? title.trim() : undefined,
      description: description ? description.trim() : undefined,
      materials: materials ? materials.trim() : undefined,
      paintingSize: paintingSize ? paintingSize.trim() : undefined,
    };

    // Remove undefined fields from updateData so they don't overwrite existing values with null/undefined
    Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);

    // If a new file is uploaded, handle it
    if (req.file) {
      console.log('🔄 New file uploaded for update:', req.file.filename);
      // First, find the existing item to get its current file path for deletion
      const existingItem = await GalleryItem.findById(id).exec();
      if (!existingItem) {
        fs.unlink(req.file.path, () => {}); // Clean up uploaded file
        return res.status(404).json({ error: "Item to update not found." });
      }

      // Delete the old file from the filesystem
      fs.unlink(existingItem.filePath, (err) => {
        if (err) console.error(`❌ Error deleting old file ${existingItem.filePath}:`, err);
      });

      // Update with the new file's details
      updateData.filePath = req.file.path;
      updateData.filename = req.file.filename;
      updateData.originalName = req.file.originalname;
    }

    // If no update data is provided and no file is uploaded, return early.
    if (Object.keys(updateData).length === 0 && !req.file) {
      return res.status(400).json({ error: "No update data provided." });
    }

    const updatedItem = await GalleryItem.findByIdAndUpdate(id, updateData, {
      new: true, // Return the updated document
      runValidators: true, // Ensure validators are run
    }).exec();

    if (!updatedItem) {
      if (req.file) fs.unlink(req.file.path, () => {}); // Clean up uploaded file if item not found for update
      return res.status(404).json({ error: "Item not found for update." });
    }

    console.log(`✅ Item ${id} updated successfully.`);
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
    res.status(500).json({ error: "Could not update item." });
  }
});


// --- ERROR HANDLING ---

// Generic error handler for Multer or other sync errors
app.use((error, req, res, next) => {
  console.error('💥 Global error handler:', error);

  // Multer specific error codes might be handled here if they aren't caught earlier
  if (error instanceof multer.MulterError) {
    // Example: file size exceeded
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: `File too large. Maximum file size is 10MB.` });
    }
    // Example: too many files
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: 'Too many files uploaded.' });
    }
    // Example: too many fields
    if (error.code === 'LIMIT_FIELD_COUNT') {
      return res.status(400).json({ error: 'Too many fields.' });
    }
    // Handle other Multer errors
    return res.status(400).json({ error: `Multer error: ${error.message}` });
  }

  // Handle Mongoose validation errors
  if (error.name === 'ValidationError') {
    const messages = Object.values(error.errors).map(err => err.message);
    return res.status(400).json({ error: 'Validation Error', details: messages });
  }

  // Handle Mongoose CastError (e.g., invalid ID format)
  if (error.name === 'CastError') {
    return res.status(400).json({ error: 'Invalid ID format.' });
  }

  // Default to 500 for other errors
  res.status(error.http_code || error.status || 500).json({ error: error.message || 'Something went wrong!' });
});

// Handle 404 Not Found routes
app.use((req, res) => {
  console.log('🔍 404 - Route not found:', req.method, req.url);
  res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Server started successfully!`);
  console.log(`🌐 Backend running on http://localhost:$`);
  console.log(`💾 File storage managed by local filesystem and MongoDB`);
  console.log(`⏰ Started at: ${new Date().toISOString()}`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('📋 Available endpoints:');
  console.log(' - GET / (test)');
  console.log(' - GET /health (health check)');
  console.log(` - POST /upload (file upload to local storage '${UPLOAD_FOLDER}' & MongoDB)`);
  console.log(' - GET /files/:section (list items from MongoDB)');
  console.log(' - GET /files/item/:id (get single item by MongoDB ID)');
  console.log(' - PUT /update/:id (update item data and optionally file)');
  console.log(` - DELETE /delete/:id (delete item from MongoDB and local file in '${UPLOAD_FOLDER}')`);
  console.log('\n');
});