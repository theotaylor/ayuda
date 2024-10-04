const express = require('express');
const multer = require('multer');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { TranscribeClient, StartTranscriptionJobCommand } = require('@aws-sdk/client-transcribe');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config(); // Load environment variables

const AWS_ACCESS_KEY_ID_DEV=process.env.AWS_ACCESS_KEY_ID_DEV
const AWS_SECRET_ACCESS_KEY_DEV=process.env.AWS_SECRET_ACCESS_KEY_DEV
const AWS_REGION_DEV=process.env.AWS_REGION_DEV

// Create an S3 client instance
const s3Client = new S3Client({
  region: AWS_REGION_DEV,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID_DEV,
    secretAccessKey: AWS_SECRET_ACCESS_KEY_DEV,
  },
});

// Create a Transcribe client instance
const transcribeClient = new TranscribeClient({
  region: AWS_REGION_DEV,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID_DEV,
    secretAccessKey: AWS_SECRET_ACCESS_KEY_DEV,
  },
});

// Set up multer for file handling
const upload = multer();

// Create a router for file uploads
const uploadRouter = express.Router();

// POST route to handle audio file uploads
uploadRouter.post('/', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }

  // Define the S3 bucket and key (file name)
  const bucketName = 'ayudabucket'; // Replace with your S3 bucket name
  const s3Key = `${uuidv4()}-${req.file.originalname}`; // Unique file name for S3

  // Upload the audio file to S3
  try {
    await s3Client.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    }));

    console.log('File uploaded to S3:', s3Key);

    // Start transcription job
    const transcribeParams = {
      TranscriptionJobName: uuidv4(),
      LanguageCode: 'en-US',
      Media: {
        MediaFileUri: `https://${bucketName}.s3.${AWS_REGION_DEV}.amazonaws.com/${s3Key}`,
      },
      MediaFormat: req.file.originalname.split('.').pop(),
      OutputBucketName: bucketName,
    };

    const data = await transcribeClient.send(new StartTranscriptionJobCommand(transcribeParams));
    console.log('Transcription job started:', data);

    res.json({ message: 'File uploaded and transcription started', transcriptionJob: data });
  } catch (error) {
    console.error('Error uploading file or starting transcription:', error);
    res.status(500).send('Error processing the file.');
  }
});

// Export the router for use in app.js
module.exports = uploadRouter;
