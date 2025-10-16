import axios from 'axios';
import { downloadClip, uploadWithTranscription } from '../services/clipService.js';
import 'dotenv/config';
import { env } from 'process';

export const processClip = async (req, res) => {
  const clipData = req.body;
  console.log('\n🎬 NEW CLIP RECEIVED\n');

  try {
    if (!clipData.secure_url && !clipData.url) throw new Error('Missing video URL');
    const clipUrl = clipData.secure_url || clipData.url;
    const clipId = clipData.new_public_id || clipData.public_id || `clip_${Date.now()}`;

    const filePath = await downloadClip(clipUrl, clipId);
    const processed = await uploadWithTranscription(filePath, clipData);

    // Optional webhook
    if (process.env.N8N_WEBHOOK_PROCESSED) {
      await axios.post(process.env.N8N_WEBHOOK_PROCESSED, processed);
    }

    res.json({
      success: true,
      message: 'Clip processed successfully',
      data: {
        clipId,
        videoWithSubtitlesUrl: processed.videoWithSubtitlesUrl,
        transcriptPublicId: processed.transcriptPublicId,
      },
    });
  } catch (err) {
    console.error('❌ ERROR PROCESSING CLIP:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const processClipsBatch = async (req, res) => {
  const clips = req.body.clips || [];
  const results = [];
  const errors = [];

  for (const clipData of clips) {
    try {
      const clipUrl = clipData.secure_url || clipData.url;
      const clipId = clipData.new_public_id || clipData.public_id || `clip_${Date.now()}`;
      const filePath = await downloadClip(clipUrl, clipId);
      const processed = await uploadWithTranscription(filePath, clipData);
      results.push({ clipId, status: 'success', videoWithSubtitlesUrl: processed.videoWithSubtitlesUrl });
    } catch (err) {
      errors.push({ clipId: clipData.new_public_id || clipData.public_id, error: err.message });
    }
  }

  res.json({ success: true, processed: results.length, failed: errors.length, results, errors });
};
