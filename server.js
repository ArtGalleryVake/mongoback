import express from "express";
import cors from "cors";
import multer from "multer";
import mongoose from 'mongoose';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';

// --- CLOUDINARY CONFIGURATION ---
cloudinary.config({
  cloud_name: 'dryegjume',
  api_key: '924472115811587',
  api_secret: 'xAj1DVAvHES_jvgNVSUpUDCcQ9Q',
});

// --- MONGODB CONFIGURATION ---
const MONGODB_URI = "mongodb+srv://artgalleryvake_db_user:EaWuUVLQ1WCo0TZm@cluster0.0r7swvv.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const PORT = process.env.PORT || 5001;

// --- MONGOOSE SETUP ---
mongoose.connect(MONGODB_URI)
.then(() => {
  console.log('🚀 Connected to MongoDB successfully!');
})
.catch(err => {
  console.error('❌ Error connecting to MongoDB:', err);
  process.exit(1);
});

// --- UPDATED MONGOOSE SCHEMA ---
const galleryItemSchema = new mongoose.Schema({
  section: { type: String, required: true, index: true },
  filename: { type: String, required: true },
  originalName: { type: String, required: true },
  title: { type: String, trim: true },
  description: { type: String, trim: true },
  materials: { type: String, trim: true },
  paintingSize: { type: String, trim: true },
  
  // Cloudinary specific fields
  cloudinaryUrl: { type: String, required: true }, // Cloudinary secure URL
  cloudinaryPublicId: { type: String, required: true }, // For deletion
  cloudinaryFormat: { type: String }, // Image format (jpg, png, etc.)
  imageWidth: { type: Number },
  imageHeight: { type: Number },
  
  uploadDate: { type: Date, default: Date.now },
}, { timestamps: true });

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

// CORS Configuration
app.use(cors({
  origin: [
    'http://localhost:3001',
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

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// --- CLOUDINARY MULTER SETUP ---
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'art-gallery', // Cloudinary folder name
    allowed_formats: ['jpg', 'png', 'jpeg', 'gif', 'webp'],
    public_id: (req, file) => {
      // Create unique filename with timestamp
      const timestamp = Date.now();
      const safeName = file.originalname.replace(/\s+/g, '_').replace(/[^\w.-]/g, '');
      return `${timestamp}-${safeName.split('.')[0]}`;
    },
    transformation: [
      { quality: 'auto' }, // Automatic quality optimization
      { fetch_format: 'auto' } // Automatic format optimization
    ]
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
    message: "Gallery Backend API with Cloudinary is running ✅",
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    storage: "Cloudinary",
    corsInfo: "CORS properly configured for multiple origins"
  });
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    storage: "Cloudinary"
  });
});

// STATS ENDPOINT
app.get("/stats", async (req, res) => {
  console.log('📊 Stats endpoint accessed');

  try {
    const sections = await GalleryItem.aggregate([
      {
        $group: {
          _id: "$section",
          count: { $sum: 1 }
        }
      }
    ]);

    const totalItems = await GalleryItem.countDocuments();

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const recentUploads = await GalleryItem.countDocuments({
      uploadDate: { $gte: weekAgo }
    });

    const stats = {
      totalItems,
      recentUploads,
      sections: sections.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      timestamp: new Date().toISOString(),
      storage: "Cloudinary"
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

// UPLOAD ENDPOINT - Updated for Cloudinary
app.post("/upload", upload.single("file"), async (req, res) => {
  console.log('\n🚀 UPLOAD ENDPOINT HIT');

  if (!req.file) {
    console.log('❌ No file uploaded');
    return res.status(400).json({ error: "File upload failed or no file provided." });
  }

  try {
    console.log('📥 File uploaded to Cloudinary successfully');
    console.log(' - Cloudinary URL:', req.file.path);
    console.log(' - Public ID:', req.file.filename);
    console.log(' - Original name:', req.file.originalname);
    console.log(' - Body Data:', req.body);

    const { section, title, description, materials, paintingSize } = req.body;

    // Create new gallery item with Cloudinary data
    const newGalleryItem = new GalleryItem({
      section: section || "others",
      filename: req.file.filename, // Cloudinary public_id
      originalName: req.file.originalname,
      title: title ? title.trim() : "",
      description: description ? description.trim() : "",
      materials: materials ? materials.trim() : "",
      paintingSize: paintingSize ? paintingSize.trim() : "",
      
      // Cloudinary specific data
      cloudinaryUrl: req.file.path, // This is the secure_url from Cloudinary
      cloudinaryPublicId: req.file.filename, // Public ID for deletion
      cloudinaryFormat: req.file.format,
      imageWidth: req.file.width,
      imageHeight: req.file.height
    });

    await newGalleryItem.save();
    console.log(`✅ Gallery item saved to MongoDB with ID: ${newGalleryItem._id}`);

    res.status(201).json({
      message: "File uploaded to Cloudinary and saved successfully!",
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
        url: newGalleryItem.cloudinaryUrl, // Cloudinary URL
        width: newGalleryItem.imageWidth,
        height: newGalleryItem.imageHeight
      }
    });

  } catch (error) {
    console.error('💥 Error saving to MongoDB:', error);
    // If MongoDB save fails, try to delete from Cloudinary
    if (req.file && req.file.filename) {
      try {
        await cloudinary.uploader.destroy(req.file.filename);
        console.log('🗑️ Cleaned up Cloudinary upload after error');
      } catch (deleteError) {
        console.error('❌ Error cleaning up Cloudinary upload:', deleteError);
      }
    }
    
    res.status(500).json({
      error: "Failed to save file data to database.",
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// GET FILES BY SECTION - Updated for Cloudinary
app.get("/files/:section", async (req, res) => {
  const { section } = req.params;
  console.log(`📋 Getting files for section: ${section}`);

  if (!section) {
    return res.status(400).json({ error: "Section parameter is required." });
  }

  try {
    const items = await GalleryItem.find({ section: section })
      .sort({ uploadDate: -1 })
      .exec();

    console.log(`✅ Found ${items.length} items for section "${section}"`);

    const filesWithData = items.map(item => ({
      _id: item._id,
      section: item.section,
      filename: item.filename,
      originalName: item.originalName,
      title: item.title,
      description: item.description,
      materials: item.materials,
      paintingSize: item.paintingSize,
      uploadDate: item.uploadDate,
      url: item.cloudinaryUrl, // Use Cloudinary URL
      width: item.imageWidth,
      height: item.imageHeight
    }));

    res.json({ files: filesWithData });

  } catch (error) {
    console.error(`❌ Error fetching files for section "${section}":`, error);
    res.status(500).json({
      error: "Could not retrieve files.",
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// GET SINGLE ITEM BY ID
app.get("/files/item/:id", async (req, res) => {
  const { id } = req.params;
  console.log(`📋 Getting single file by ID: ${id}`);

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Invalid ID format." });
  }

  try {
    const item = await GalleryItem.findById(id).exec();

    if (!item) {
      console.log(`❌ Item with ID ${id} not found.`);
      return res.status(404).json({ error: "Item not found." });
    }

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
      url: item.cloudinaryUrl, // Use Cloudinary URL
      width: item.imageWidth,
      height: item.imageHeight
    });

  } catch (error) {
    console.error(`❌ Error fetching item with ID ${id}:`, error);
    res.status(500).json({
      error: "Could not retrieve item.",
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// DELETE ENDPOINT - Updated for Cloudinary
app.delete("/delete/:id", async (req, res) => {
  const { id } = req.params;
  console.log(`🗑️ Delete request for item ID: ${id}`);

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Invalid ID format." });
  }

  try {
    const item = await GalleryItem.findById(id).exec();

    if (!item) {
      console.log(`❌ Item with ID ${id} not found.`);
      return res.status(404).json({ error: "Item not found." });
    }

    const cloudinaryPublicId = item.cloudinaryPublicId;

    // Delete from MongoDB first
    await GalleryItem.findByIdAndDelete(id).exec();
    console.log(`✅ Item ${id} deleted from MongoDB.`);

    // Delete from Cloudinary
    try {
      const result = await cloudinary.uploader.destroy(cloudinaryPublicId);
      console.log(`✅ Image deleted from Cloudinary:`, result);
    } catch (cloudinaryError) {
      console.error(`❌ Error deleting from Cloudinary:`, cloudinaryError);
      // Don't fail the whole request if Cloudinary deletion fails
    }

    res.json({ 
      message: "Item deleted successfully from database and Cloudinary.", 
      timestamp: new Date().toISOString() 
    });

  } catch (error) {
    console.error(`💥 Error during deletion for item ID ${id}:`, error);
    res.status(500).json({
      error: "Could not delete item.",
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// UPDATE ENDPOINT - Updated for Cloudinary
app.put("/update/:id", upload.single("file"), async (req, res) => {
  const { id } = req.params;
  console.log(`🔄 Update request for item ID: ${id}`);

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Invalid ID format." });
  }

  try {
    const { section, title, description, materials, paintingSize } = req.body;
    const updateData = {
      ...(section !== undefined && { section: section.trim() }),
      ...(title !== undefined && { title: title.trim() }),
      ...(description !== undefined && { description: description.trim() }),
      ...(materials !== undefined && { materials: materials.trim() }),
      ...(paintingSize !== undefined && { paintingSize: paintingSize.trim() }),
    };

    // Handle new file upload to Cloudinary
    if (req.file) {
      console.log('🔄 New file uploaded to Cloudinary for update:', req.file.filename);
      
      const existingItem = await GalleryItem.findById(id).exec();
      if (!existingItem) {
        // Try to clean up the new Cloudinary upload
        try {
          await cloudinary.uploader.destroy(req.file.filename);
        } catch (cleanupError) {
          console.error('Error cleaning up new upload:', cleanupError);
        }
        return res.status(404).json({ error: "Item to update not found." });
      }

      // Delete old image from Cloudinary
      try {
        await cloudinary.uploader.destroy(existingItem.cloudinaryPublicId);
        console.log('🗑️ Old image deleted from Cloudinary');
      } catch (deleteError) {
        console.error('❌ Error deleting old image from Cloudinary:', deleteError);
      }

      // Add new Cloudinary data to updateData
      updateData.filename = req.file.filename;
      updateData.originalName = req.file.originalname;
      updateData.cloudinaryUrl = req.file.path;
      updateData.cloudinaryPublicId = req.file.filename;
      updateData.cloudinaryFormat = req.file.format;
      updateData.imageWidth = req.file.width;
      updateData.imageHeight = req.file.height;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: "No update data provided." });
    }

    const updatedItem = await GalleryItem.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    }).exec();

    if (!updatedItem) {
      return res.status(404).json({ error: "Item not found for update." });
    }

    console.log(`✅ Item ${id} updated successfully.`);

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
        url: updatedItem.cloudinaryUrl,
        width: updatedItem.imageWidth,
        height: updatedItem.imageHeight
      }
    });

  } catch (error) {
    console.error(`💥 Error during update for item ID ${id}:`, error);
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

  if (error instanceof multer.MulterError) {
    let errorMessage = `Multer error: ${error.message}`;
    if (error.code === 'LIMIT_FILE_SIZE') {
      errorMessage = `File too large. Maximum file size is 10MB.`;
    }
    return res.status(400).json({ error: errorMessage });
  }

  if (error.name === 'ValidationError') {
    const messages = Object.values(error.errors).map(err => err.message);
    return res.status(400).json({ error: 'Validation Error', details: messages });
  }

  res.status(500).json({
    error: error.message || 'Something went wrong!',
    timestamp: new Date().toISOString()
  });
});

// --- 404 Handler ---
app.use((req, res) => {
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
  console.log(`☁️  File storage: Cloudinary (dryegjume)`);
  console.log(`💾 Database: MongoDB Atlas`);
  console.log(`⏰ Started at: ${new Date().toISOString()}`);
  console.log('\n📋 Available endpoints:');
  console.log(' - GET / (test)');
  console.log(' - GET /health (health check)');
  console.log(' - GET /stats (gallery statistics)');
  console.log(' - POST /upload (file upload to Cloudinary & MongoDB)');
  console.log(' - GET /files/:section (list items from MongoDB)');
  console.log(' - GET /files/item/:id (get single item by MongoDB ID)');
  console.log(' - PUT /update/:id (update item data and optionally file)');
  console.log(' - DELETE /delete/:id (delete item from MongoDB and Cloudinary)');
  console.log('\n☁️  Images now stored permanently in Cloudinary!');
});