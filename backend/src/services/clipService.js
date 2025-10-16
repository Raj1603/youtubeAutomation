import axios from 'axios';
import fs from 'fs';
import path from 'path';
import cloudinary from '../config/cloudinary.js';
import { cleanupFile, ensureDir } from '../utils/fileUtils.js';

const TEMP_DIR = path.resolve('temp_clips');
ensureDir(TEMP_DIR);

const N8N_WEBHOOK_PROCESSED = ''; // TODO: move to .env if needed

export async function waitForTranscript(publicId, maxAttempts = 15, delayMs = 5000) {
  console.log(`⏳ Waiting for transcript: ${publicId}`);
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await cloudinary.api.resource(publicId, { resource_type: 'raw' });
      console.log(`✅ Transcript ready: ${publicId}`);
      return true;
    } catch {
      if (i < maxAttempts - 1) {
        console.log(`   Attempt ${i + 1}/${maxAttempts} - waiting ${delayMs / 1000}s...`);
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  }
  throw new Error(`Transcript generation timed out for: ${publicId}`);
}

export async function downloadClip(clipUrl, clipId) {
  const filePath = path.join(TEMP_DIR, `${clipId}.mp4`);
  console.log(`📥 Downloading clip: ${clipId}`);
  const response = await axios({ method: 'get', url: clipUrl, responseType: 'stream' });
  const writer = fs.createWriteStream(filePath);
  response.data.pipe(writer);
  await new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
  console.log(`✅ Downloaded: ${clipId}`);
  return filePath;
}

export async function uploadWithTranscription(filePath, clipData) {
  const publicIdBase = clipData.new_public_id || `clip_${Date.now()}`;
  const folder = 'processed_clips';
  console.log(`📤 Uploading with transcription: ${publicIdBase}`);

  const uploadResult = await cloudinary.uploader.upload(filePath, {
    public_id: publicIdBase,
    folder,
    resource_type: 'video',
    raw_convert: 'google_speech:srt:vtt',
  });

  const transcriptPublicId = `${folder}/${publicIdBase}.transcript`;
  await waitForTranscript(transcriptPublicId);

  const videoWithSubtitlesUrl = cloudinary.url(uploadResult.public_id, {
    resource_type: 'video',
    transformation: [{
      overlay: { resource_type: 'subtitles', public_id: transcriptPublicId },
      flags: 'layer_apply',
      color: '#FFFFFF',
      background: 'rgb:000000',
      gravity: 'south',
      y: 50,
    }],
  });

  let transcriptText = '';
  try {
    const transcriptUrl = cloudinary.url(transcriptPublicId, { resource_type: 'raw', flags: 'attachment' });
    const { data } = await axios.get(transcriptUrl);
    transcriptText = data;
  } catch (err) {
    console.warn(`⚠️ Could not fetch transcript text: ${err.message}`);
  }

  cleanupFile(filePath);

  return {
    videoPublicId: uploadResult.public_id,
    transcriptPublicId,
    videoUrl: uploadResult.secure_url,
    videoWithSubtitlesUrl,
    duration: uploadResult.duration,
    format: uploadResult.format,
    transcriptText,
  };
}
