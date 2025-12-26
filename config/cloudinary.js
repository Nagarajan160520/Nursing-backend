const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'your_cloud_name',
  api_key: process.env.CLOUDINARY_API_KEY || 'your_api_key',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'your_api_secret',
  secure: true
});

// Upload image to Cloudinary
exports.uploadImage = async (filePath, folder = 'nursing_institute') => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: folder,
      use_filename: true,
      unique_filename: true,
      overwrite: true,
      resource_type: 'auto'
    });
    return result;
  } catch (error) {
    console.error('Cloudinary Upload Error:', error);
    throw new Error('Failed to upload image');
  }
};

// Delete image from Cloudinary
exports.deleteImage = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error('Cloudinary Delete Error:', error);
    throw new Error('Failed to delete image');
  }
};

// Get Cloudinary URL for optimization
exports.getOptimizedUrl = (publicId, options = {}) => {
  const defaultOptions = {
    width: 800,
    height: 600,
    crop: 'fill',
    quality: 'auto',
    format: 'auto'
  };

  const config = { ...defaultOptions, ...options };
  
  return cloudinary.url(publicId, config);
};

// Upload multiple images
exports.uploadMultipleImages = async (files, folder = 'nursing_institute') => {
  try {
    const uploadPromises = files.map(file => 
      cloudinary.uploader.upload(file.path, {
        folder: folder,
        use_filename: true,
        unique_filename: true
      })
    );

    const results = await Promise.all(uploadPromises);
    return results;
  } catch (error) {
    console.error('Cloudinary Multiple Upload Error:', error);
    throw new Error('Failed to upload images');
  }
};

// Generate thumbnail URL
exports.getThumbnailUrl = (publicId, width = 300, height = 200) => {
  return cloudinary.url(publicId, {
    width: width,
    height: height,
    crop: 'fill',
    quality: 'auto',
    format: 'auto'
  });
};

module.exports = cloudinary;