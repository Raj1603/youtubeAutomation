export const healthCheck = (req, res) => {
  res.json({
    status: 'healthy',
    service: 'Video Clip Transcription Service',
    timestamp: new Date().toISOString(),
  });
};
