import { useState, useEffect } from 'react';

function AudioRecorder() {
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [audioURL, setAudioURL] = useState('');
  const [audioBlob, setAudioBlob] = useState(null)

  useEffect(() => {
    // Get user permission to access microphone
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        const recorder = new MediaRecorder(stream);
        setMediaRecorder(recorder);
      })
      .catch(err => console.error('Error accessing microphone', err));
  }, []);

  const startRecording = () => {
    if (mediaRecorder) {
      let chunks = [];
      setIsRecording(true);

      mediaRecorder.start();

      // Collect audio data in chunks
      mediaRecorder.ondataavailable = event => {
        chunks.push(event.data);
      };

      // When recording stops, create a blob and set the audio URL
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(chunks, { type: 'audio/wav' });
        const audioUrl = URL.createObjectURL(audioBlob);
        setAudioURL(audioUrl);
        setAudioBlob(audioBlob)
      };
    }
  };

  const stopRecording = () => {
    if (mediaRecorder) {
      setIsRecording(false);
      mediaRecorder.stop(); // Stop recording
    }
  };

  const sendAudioToBackend = () => {
    if (audioBlob) {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.wav'); // Append the audio file

      // Send the file to the backend using fetch or axios
      fetch('http://localhost:3000/api/upload', {
        method: 'POST',
        body: formData
      })
        .then(response => response.json())
        .then(data => {
          console.log('Success:', data);
        })
        .catch(error => {
          console.error('Error:', error);
        });
    }
  };

  return (
    <div>
      <h1>Audio Recorder</h1>

      <button onClick={startRecording} disabled={isRecording}>
        Start Recording
      </button>
      <button onClick={stopRecording} disabled={!isRecording}>
        Stop Recording
      </button>

      {audioURL && (
        <div>
          <h3>Recorded Audio:</h3>
          <audio controls src={audioURL}></audio>
          <a href={audioURL} download="recording.wav">Download Recording</a>
        </div>
      )}
    
      <button onClick={sendAudioToBackend} disabled={!audioBlob}>
        Send Audio to Backend
      </button>
    </div>
  );
}

export default AudioRecorder;
