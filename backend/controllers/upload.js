const express = require('express');
const multer = require('multer');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { TranscribeClient, StartTranscriptionJobCommand, GetTranscriptionJobCommand } = require('@aws-sdk/client-transcribe');
const { v4: uuidv4 } = require('uuid');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const { Readable } = require('stream');
require('dotenv').config(); // Load environment variables
const Summary = require('../models/summary')
const Transcription = require('../models/Transcription');

const AWS_ACCESS_KEY_ID_DEV = process.env.AWS_ACCESS_KEY_ID_DEV;
const AWS_SECRET_ACCESS_KEY_DEV = process.env.AWS_SECRET_ACCESS_KEY_DEV;
const AWS_REGION_DEV = process.env.AWS_REGION_DEV;
const HUGGINGFACE_API_KEY = process.env.HUGGING_FACE_API_KEY_FIRST;

// Create an S3 client instance
const s3Client = new S3Client({
  region: AWS_REGION_DEV,
  //endpoint: `https://s3.${AWS_REGION_DEV}.amazonaws.com`, // Explicitly set the endpoint
  endpoint: 'https://s3.us-east-1.amazonaws.com',
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

  try {
    // Upload the audio file to S3
    await s3Client.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    }));

    console.log('File uploaded to S3:', s3Key);

    // Start transcription job
    const transcriptionJobName = uuidv4();
    const transcribeParams = {
      TranscriptionJobName: transcriptionJobName,
      LanguageCode: 'en-US',
      Media: {
        MediaFileUri: `https://${bucketName}.s3.${AWS_REGION_DEV}.amazonaws.com/${s3Key}`,
      },
      MediaFormat: req.file.originalname.split('.').pop(),
      OutputBucketName: bucketName,
      Settings: {
        ShowSpeakerLabels: true,
        MaxSpeakerLabels: 2
      }
    };

    await transcribeClient.send(new StartTranscriptionJobCommand(transcribeParams));
    console.log('Transcription job started:', transcriptionJobName);

    // Wait for the transcription to complete
    const transcriptionResult = await checkTranscriptionJobStatus(transcriptionJobName);

    console.log('transcriptionResult', transcriptionResult)

    if (transcriptionResult) {
      // Save transcription to MongoDB
      const transcription = new Transcription(transcriptionResult);
      const savedTranscription = await transcription.save();
      console.log('Transcription saved to MongoDB:', savedTranscription);

      // Send the transcription text to Hugging Face for summarization
      //const summaryText = await summarizeText(transcriptionResult.transcription);

      if (transcriptionResult && transcriptionResult.transcript) {
        const summaryText = await summarizeText(transcriptionResult.transcript); // Define summaryText here with the returned value from summarizeText()
        console.log("Summary:", summaryText);
      
        // Save the summary to the database
        const summary = new Summary({
          content: summaryText,
        });
        const savedSummary = await summary.save();
        console.log("Summary in Mongo");
      
        return res.json({ transcription: savedTranscription, summary: savedSummary });
      } else {
        console.error("Transcription result or transcript is undefined.");
      }

      return res.json({ transcription: savedTranscription, summary: savedSummary });
    } else {
      return res.status(500).json({ message: 'Transcription failed.' });
    }

  } catch (error) {
    console.error('Error uploading file or starting transcription:', error);
    res.status(500).send('Error processing the file.');
  }
});

// Function to check transcription job status
async function checkTranscriptionJobStatus(transcriptionJobName) {
  let jobCompleted = false;
  let transcriptionResult = '';

  while (!jobCompleted) {
    // Wait a few seconds before checking the status again
    await new Promise(resolve => setTimeout(resolve, 5000));

    const jobStatusResponse = await transcribeClient.send(
      new GetTranscriptionJobCommand({ TranscriptionJobName: transcriptionJobName })
    );

    const jobStatus = jobStatusResponse.TranscriptionJob.TranscriptionJobStatus;
    console.log('Transcription job status:', jobStatus);

    if (jobStatus === 'COMPLETED') {
      // Get the TranscriptFileUri from the job status response
      const transcriptUri = jobStatusResponse.TranscriptionJob.Transcript.TranscriptFileUri;
      transcriptionResult = await fetchTranscriptionJson(transcriptUri);
      jobCompleted = true;
    } else if (jobStatus === 'FAILED') {
      console.error('Transcription job failed.');
      jobCompleted = true;
    }
  }

  console.log('transcriptionResult:', transcriptionResult)
  return transcriptionResult;
}

// Function to fetch the transcription JSON file from S3
async function fetchTranscriptionJson(transcriptUri) {
  const url = new URL(transcriptUri);
  const pathSegments = url.pathname.split('/').filter(segment => segment);
  const bucketName = pathSegments[0];
  const key = pathSegments.slice(1).join('/');

  try {
    const command = new GetObjectCommand({ Bucket: bucketName, Key: key });
    const data = await s3Client.send(command);

    const streamToString = (stream) => {
      return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
        stream.on('error', reject);
      });
    };

    const jsonString = await streamToString(data.Body);
    const transcriptJson = JSON.parse(jsonString);

    // Check for speaker labels and transcripts
    if (transcriptJson.results && transcriptJson.results.transcripts.length > 0) {
      const transcriptText = transcriptJson.results.transcripts[0].transcript;
      const speakerLabels = transcriptJson.results.speaker_labels || [];

      // Map each segment to the identified speaker
      const speakerSegments = speakerLabels.segments.map(segment => ({
        speaker: segment.speaker_label,
        startTime: segment.start_time,
        endTime: segment.end_time,
        content: transcriptJson.results.items
          .filter(item => item.start_time >= segment.start_time && item.end_time <= segment.end_time)
          .map(item => item.alternatives[0].content)
          .join(' ')
      }));

      return { transcript: transcriptText, speakerSegments };
    } else {
      console.error('Transcript not found in the response.');
      return null;
    }
  } catch (error) {
    console.error('Error fetching transcription JSON:', error);
    return null;
  }
}

// Function to summarize text using Hugging Face
async function summarizeText(transcript) {
  console.log('transcript', transcript)
  const response = await fetch('https://api-inference.huggingface.co/models/facebook/bart-large-cnn', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${HUGGINGFACE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      inputs: transcript,
    }),
  });

  console.log('Response status:', response.status); // Log response status
  const summaryData = await response.json();

  if (response.status !== 200) {
    console.error('Error summarizing text:', summaryData.error || 'Unknown error');
    return 'Error summarizing text.';
  }

  console.log('summaryData:', summaryData)
  return summaryData[0].summary_text;
}


// Export the router for use in app.js
module.exports = uploadRouter;
