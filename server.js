import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// Use environment variable for port, fallback to 5001
const PORT = process.env.PORT || 5001;

// Enhanced logging middleware
app.use((req, res, next) => {
  console.log(`\n🔥 ${new Date().toISOString()} - ${req.method} ${req.url}`);
  // Log request body if it exists and is not empty
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('Body:', req.body);
  }
  next();
});

// CORS Configuration
app.use(cors({
  origin: function(origin, callback) {
    console.log('🌐 CORS request from origin:', origin);
    
    // Allow requests with no origin (like mobile apps, Postman, curl)
    if (!origin) return callback(null, true);
    
    // Define ALL allowed origins
    const allowedOrigins = [
      'http://localhost:3000',       // For local frontend development (if your frontend runs on port 3000)
      // Add other local origins if you use them, e.g., 'http://localhost:3004'
      'https://yourusername.github.io', // For your deployed frontend on GitHub Pages (replace 'yourusername')
      // If your GitHub Pages site is in a subdirectory like /Gallery/, the origin is still 'https://yourusername.github.io'.
      // So, this one entry should cover it.
    ];
    
    // Check if the requesting origin is in our allowed list
    if (allowedOrigins.includes(origin)) {
      callback(null, true); // Origin is allowed
    } else {
      // If the origin is not allowed, send an error back
      console.error(`CORS ERROR: Request from disallowed origin: ${origin}`);
      callback(new Error('Not allowed by CORS')); 
    }
  },
  methods: ["GET", "POST", "DELETE", "OPTIONS"], // Include OPTIONS for preflight requests
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true // Use if your backend requires authentication cookies or tokens
}));

// Middleware to parse JSON request bodies
app.use(express.json());

// Middleware to parse URL-encoded request bodies (often needed for form submissions)
// app.use(express.urlencoded({ extended: true })); // Uncomment if needed

// Serve uploaded files statically from the 'uploads' directory
// Files will be accessible at '/uploads/section/filename'
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- HELPER FUNCTIONS ---

// Get the path for the metadata JSON file associated with an image
const getMetadataPath = (imagePath) => {
  const parsedPath = path.parse(imagePath);
  return path.join(parsedPath.dir, parsedPath.name + '.json');
};

// Save metadata to a JSON file
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

// Load metadata from a JSON file
const loadMetadata = (imagePath) => {
  const metadataPath = getMetadataPath(imagePath);
  try {
    // Check if the metadata file exists before trying to read it
    if (fs.existsSync(metadataPath)) {
      const data = fs.readFileSync(metadataPath, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('❌ Error loading metadata:', error);
  }
  return null; // Return null if file doesn't exist or error occurs
};

// --- MULTER SETUP FOR FILE UPLOADS ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Temporary directory for uploads, will be moved later
    const tempUploadPath = path.join(__dirname, "uploads", "temp");
    console.log('📁 Setting up temporary file destination:', tempUploadPath);
    try {
      // Ensure the directory exists recursively
      fs.mkdirSync(tempUploadPath, { recursive: true });
      console.log('✅ Temp directory created/verified');
      cb(null, tempUploadPath); // Callback with the directory path
    } catch (error) {
      console.error('❌ Error creating temp directory:', error);
      cb(error, null); // Callback with error
    }
  },
  filename: (req, file, cb) => {
    // Create a unique filename to avoid collisions
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const filename = uniqueSuffix + path.extname(file.originalname);
    console.log('📄 Generated filename:', filename);
    cb(null, filename); // Callback with the generated filename
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // Limit file size to 10MB
  },
  fileFilter: (req, file, cb) => {
    console.log('🔍 File filter check:');
    console.log(' - Original name:', file.originalname);
    console.log(' - Mimetype:', file.mimetype);
    // Accept only image files
    if (file.mimetype.startsWith('image/')) {
      console.log('✅ File accepted (image)');
      cb(null, true); // Accept the file
    } else {
      console.log('❌ File rejected (not an image)');
      cb(new Error('Only image files are allowed!'), false); // Reject the file
    }
  }
});

// --- API ROUTES ---

// Route for the root endpoint (API health check/info)
app.get("/", (req, res) => {
  console.log('🏠 Root route accessed');
  res.json({ 
    message: "Gallery Backend API is running ✅",
    environment: process.env.NODE_ENV || 'development', // Show current environment
    timestamp: new Date().toISOString()
  });
});

// Health check endpoint (useful for monitoring services like Render)
app.get("/health", (req, res) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

// POST route to handle file uploads
app.post("/upload", upload.single("file"), (req, res) => {
  console.log('\n🚀 UPLOAD ENDPOINT HIT');

  // Multer error handling (if file size limit exceeded, wrong file type, etc.)
  if (req.fileValidationError) {
    console.error('❌ Multer fileValidationError:', req.fileValidationError);
    return res.status(400).json({ error: req.fileValidationError.message });
  }
  if (req.error) { // Catch other potential Multer errors
    console.error('❌ Multer error:', req.error);
    return res.status(400).json({ error: req.error.message });
  }

  // Check if a file was actually uploaded
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

    // Extract metadata from request body, with defaults
    const section = req.body.section || "others";
    const title = req.body.title || "";
    const description = req.body.description || "";

    console.log('📂 Target section:', section);
    console.log('📝 Title:', title);
    console.log('📝 Description:', description);

    const tempPath = req.file.path; // Path of the file after Multer saved it temporarily
    const finalDir = path.join(__dirname, "uploads", section); // Target directory based on section
    console.log('📁 Creating final section directory:', finalDir);

    // Create the section directory if it doesn't exist
    fs.mkdirSync(finalDir, { recursive: true });
    console.log('✅ Section directory ready');

    const finalPath = path.join(finalDir, req.file.filename); // Final path for the uploaded file
    console.log('🔄 Moving file from:', tempPath);
    console.log(' to:', finalPath);

    // Move the file from the temporary location to its final destination
    fs.renameSync(tempPath, finalPath);
    console.log('✅ File moved successfully');

    // Save metadata if title or description were provided
    if (title || description) {
      const metadata = {
        title: title,
        description: description,
        uploadDate: new Date().toISOString(),
        originalName: req.file.originalname,
        section: section
      };
      console.log('💾 Saving metadata:', metadata);
      saveMetadata(finalPath, metadata); // Use helper to save metadata
    }

    // Construct the public URL for the uploaded file
    const fileUrl = `/uploads/${section}/${req.file.filename}`;

    console.log('📤 Sending success response');
    console.log('File URL:', fileUrl);

    // Send a success response to the client
    res.status(201).json({
      message: "File uploaded successfully!",
      file: {
        filename: req.file.filename,
        url: fileUrl, // The relative URL to access the file
        path: finalPath, // The server-side path (for backend use)
        metadata: { title, description, uploadDate: new Date().toISOString(), originalName: req.file.originalname, section: section }
      },
      section: section,
    });

  } catch (error) {
    // Catch any errors during file processing (moving, saving metadata)
    console.error('💥 Upload processing error:', error);
    console.error('Error stack:', error.stack);
    // Attempt to clean up the temporary file if an error occurred after Multer saved it
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
        console.log('🧹 Cleaned up temporary file:', req.file.path);
      } catch (cleanupError) {
        console.error('❌ Error during temp file cleanup:', cleanupError);
      }
    }
    // Send a 500 error response
    res.status(500).json({ error: "Upload failed: " + error.message });
  }
});

// GET route to retrieve all files for a specific section
app.get("/files/:section", (req, res) => {
  console.log(`📋 Getting files for section: ${req.params.section}`);
  try {
    const section = req.params.section;
    const sectionPath = path.join(__dirname, "uploads", section); // Path to the section's upload folder
    console.log('Looking for files in:', sectionPath);

    // If the section directory doesn't exist, return an empty array
    if (!fs.existsSync(sectionPath)) {
      console.log('📁 Section directory does not exist');
      return res.json({ files: [] });
    }

    const allEntries = fs.readdirSync(sectionPath); // Read all entries in the directory
    const filesWithData = [];

    // Iterate over each entry to find image files and their metadata
    for (const entryName of allEntries) {
      const entryPath = path.join(sectionPath, entryName);
      const stat = fs.statSync(entryPath); // Get file stats (for checking if it's a file and getting creation time)

      if (stat.isFile()) { // Only process files
        const ext = path.extname(entryName).toLowerCase();
        // Check if the file has a common image extension
        if (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'].includes(ext)) {
          const metadata = loadMetadata(entryPath); // Load associated metadata
          filesWithData.push({
            filename: entryName, // The file's name
            url: `/uploads/${section}/${entryName}`, // The relative URL to access the file
            path: entryPath, // The server-side path
            metadata: metadata || {}, // The loaded metadata, or an empty object if none
            creationTime: stat.birthtime || stat.mtime // Use birthtime if available, else modification time
          });
        }
      }
    }

    // Sort files by creation time in descending order (newest first)
    filesWithData.sort((a, b) => b.creationTime - a.creationTime);

    console.log(`📄 Found and sorted ${filesWithData.length} files`);
    // Send the list of files back to the client
    res.json({ files: filesWithData });

  } catch (error) {
    console.error("❌ Error getting files:", error);
    // Send a 500 error if something goes wrong
    res.status(500).json({ error: "Could not get files" });
  }
});

// DELETE route to remove a file and its associated metadata
app.delete("/delete", (req, res) => {
  console.log('🗑️ Delete request:', req.body);
  const { filename, section } = req.body; // Get filename and section from request body

  // Basic validation: ensure filename and section are provided
  if (!filename || !section) {
    console.log('❌ Missing filename or section');
    return res.status(400).json({ error: "Filename and section are required" });
  }

  const filePath = path.join(__dirname, "uploads", section, filename); // Construct the full path to the file
  const metadataPath = getMetadataPath(filePath); // Construct the path to the metadata file

  console.log('Attempting to delete:', filePath);
  console.log('And metadata:', metadataPath);

  try {
    let deletedCount = 0; // Keep track of how many items were deleted

    // Delete the image file if it exists
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`✅ Image deleted: ${section}/${filename}`);
      deletedCount++;
    }

    // Delete the metadata file if it exists
    if (fs.existsSync(metadataPath)) {
      fs.unlinkSync(metadataPath);
      console.log(`✅ Metadata deleted: ${section}/${filename}.json`);
      deletedCount++;
    }

    // Respond based on whether anything was deleted
    if (deletedCount > 0) {
      res.json({ message: "File deleted successfully" });
    } else {
      console.log('❌ File not found for deletion');
      res.status(404).json({ error: "File not found" }); // Respond with 404 if neither file nor metadata existed
    }

  } catch (err) {
    console.error("❌ Delete error:", err);
    // Send a 500 error if deletion fails
    res.status(500).json({ error: "Could not delete file" });
  }
});

// GET route to retrieve statistics (count of files per section)
app.get("/stats", (req, res) => {
  console.log('📊 Getting upload statistics');
  try {
    const uploadsPath = path.join(__dirname, "uploads"); // Path to the main uploads directory
    const stats = {}; // Object to store statistics
    console.log('Checking uploads directory:', uploadsPath);

    // Check if the uploads directory exists
    if (fs.existsSync(uploadsPath)) {
      // Get all entries in the uploads directory
      const sections = fs.readdirSync(uploadsPath).filter(item => {
        const itemPath = path.join(uploadsPath, item);
        const isDir = fs.statSync(itemPath).isDirectory();
        const notTemp = item !== 'temp'; // Exclude the temporary upload directory
        return isDir && notTemp; // Only consider directories that are not 'temp'
      });

      console.log('Valid sections found:', sections);

      // Iterate over each valid section to count files
      sections.forEach(section => {
        const sectionPath = path.join(uploadsPath, section);
        const allFiles = fs.readdirSync(sectionPath); // Get all files in the section
        // Filter for image files
        const imageFiles = allFiles.filter(filename => {
          const ext = path.extname(filename).toLowerCase();
          return ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'].includes(ext);
        });
        stats[section] = imageFiles.length; // Store the count for this section
        console.log(` - ${section}: ${imageFiles.length} files`);
      });
    } else {
      console.log('❌ Uploads directory does not exist');
    }

    console.log('Final stats:', stats);
    res.json({ stats }); // Send the collected statistics

  } catch (error) {
    console.error("❌ Stats error:", error);
    res.status(500).json({ error: "Could not get stats" }); // Send 500 error if stats calculation fails
  }
});

// --- GLOBAL MIDDLEWARE FOR ERROR HANDLING AND 404 ---

// Global error handler: Catches errors from routes and middleware
app.use((error, req, res, next) => {
  console.error('💥 Global error handler caught an error:', error);
  // Try to send a meaningful error message, but default to a generic one
  res.status(500).json({ error: 'Something went wrong on the server!' });
});

// 404 handler: Catches any requests that do not match existing routes
app.use((req, res) => {
  console.log('🔍 404 - Route not found:', req.method, req.url);
  res.status(404).json({ error: 'Route not found' }); // Respond with a 404 JSON object
});

// --- SERVER STARTUP ---
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
  console.log(' - GET /stats (upload statistics)');
  console.log(' - DELETE /delete (delete file and metadata)');
  console.log('\n');
});