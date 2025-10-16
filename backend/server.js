
import express from 'express';
import { v2 as cloudinary } from 'cloudinary';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import 'dotenv/config';
import { env } from 'process';
import { log } from 'console';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- CONFIGURATION ---
cloudinary.config({
    cloud_name: env.CLOUDNAME,
    api_key: env.API_KEY,
    api_secret: env.API_SECRET,
});

const app = express();
app.use(express.json({ limit: '50mb' }));

const N8N_WEBHOOK_PROCESSED = env.WEBHOOK_URL ;

const TEMP_DIR = path.join(__dirname, 'temp_clips');
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// --- UTILITY FUNCTIONS ---

async function waitForTranscript(publicId, maxAttempts = 15, delayMs = 5000) {
    console.log(`⏳ Waiting for transcript: ${publicId}`);
    for (let i = 0; i < maxAttempts; i++) {
        try {
            await cloudinary.api.resource(publicId, { resource_type: 'raw' });
            console.log(`✅ Transcript ready: ${publicId}`);
            return true;
        } catch {
            if (i < maxAttempts - 1) {
                console.log(`   Attempt ${i + 1}/${maxAttempts} - waiting ${delayMs/1000}s...`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
    }
    throw new Error(`Transcript generation timed out for: ${publicId}`);
}

async function downloadClip(clipUrl, clipId) {
    const tempFilePath = path.join(TEMP_DIR, `${clipId}.mp4`);
    console.log(`📥 Downloading clip: ${clipId}`);
    const response = await axios({ method: 'get', url: clipUrl, responseType: 'stream' });
    const writer = fs.createWriteStream(tempFilePath);
    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
        writer.on('finish', () => {
            console.log(`✅ Downloaded: ${clipId}`);
            resolve(tempFilePath);
        });
        writer.on('error', reject);
    });
}

async function uploadWithTranscription(filePath, clipData) {
    const publicIdBase = clipData.new_public_id || `clip_${Date.now()}`;
    const folder = 'processed_clips';
    console.log(`📤 Uploading with transcription: ${publicIdBase}`);
    const uploadResult = await cloudinary.uploader.upload(filePath, {
        public_id: publicIdBase,
        folder,
        resource_type: 'video',
        raw_convert: 'google_speech:srt:vtt',
    });
    console.log(`✅ Uploaded: ${uploadResult.public_id}`);

    const transcriptPublicId = `${folder}/${publicIdBase}.transcript`;
    await waitForTranscript(transcriptPublicId);

    const videoWithSubtitles = cloudinary.url(uploadResult.public_id, {
        resource_type: 'video',
        transformation: [{
            overlay: {
                resource_type: 'subtitles',
                public_id: transcriptPublicId,
            },
            flags: 'layer_apply',
            color: '#FFFFFF',
            background: 'rgb:000000',
            gravity: 'south',
            y: 50,
        }]
    });

    let transcriptText = '';
    try {
        const transcriptUrl = cloudinary.url(transcriptPublicId, { resource_type: 'raw', flags: 'attachment' });
        const transcriptResponse = await axios.get(transcriptUrl);
        transcriptText = transcriptResponse.data;
    } catch (error) {
        console.warn(`⚠️ Could not fetch transcript text: ${error.message}`);
    }

    return {
        videoPublicId: uploadResult.public_id,
        transcriptPublicId,
        videoUrl: uploadResult.secure_url,
        videoWithSubtitlesUrl: videoWithSubtitles,
        duration: uploadResult.duration,
        format: uploadResult.format,
        transcriptText,
        originalClipData: clipData,
    };
}

function cleanupFile(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`🗑️ Cleaned up: ${path.basename(filePath)}`);
        }
    } catch (error) {
        console.error(`⚠️ Cleanup failed: ${error.message}`);
    }
}

// --- API ENDPOINTS ---

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check of the service
 *     responses:
 *       200:
 *         description: Service health status and timestamp
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 service:
 *                   type: string
 *                 timestamp:
 *                   type: string
 */
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'Video Clip Transcription Service',
        timestamp: new Date().toISOString(),
    });
});

/**
 * @swagger
 * /process-clip:
 *   post:
 *     summary: Process and transcribe a single video clip
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               public_id:
 *                 type: string
 *                 example: clip_xxx
 *               secure_url:
 *                 type: string
 *                 example: https://res.cloudinary.com/rajicloudinary/video/upload/v1760081802/clip_xxx.mp4
 *               new_public_id:
 *                 type: string
 *                 example: clip_new
 *               start_time:
 *                 type: number
 *                 example: 0
 *               clip_duration:
 *                 type: number
 *                 example: 60
 *     responses:
 *       200:
 *         description: Clip processed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     clipId:
 *                       type: string
 *                     videoWithSubtitlesUrl:
 *                       type: string
 *                     transcriptPublicId:
 *                       type: string
 *       500:
 *         description: Error processing clip
 */
app.post('/process-clip', async (req, res) => {
    const clipData = req.body;
    console.log('\n========================================');
    console.log('🎬 NEW CLIP RECEIVED');
    console.log('========================================');
    console.log('Clip ID:', clipData.new_public_id || clipData.public_id);
    console.log('Start Time:', clipData.start_time ?? 0, 'seconds');

    let tempFilePath = null;

    try {
        if (!clipData.secure_url && !clipData.url) {
            throw new Error('Missing video URL (secure_url or url) in request');
        }
        if (!clipData.public_id && !clipData.new_public_id) {
            throw new Error('Missing public_id or new_public_id in request');
        }

        const clipUrl = clipData.secure_url || clipData.url;
        const clipId = clipData.new_public_id || clipData.public_id || `clip_${Date.now()}`;

        tempFilePath = await downloadClip(clipUrl, clipId);
        const processedResult = await uploadWithTranscription(tempFilePath, clipData);

        console.log('🚀 Sending to n8n webhook...');
        console.log(`n8n webhook ${N8N_WEBHOOK_PROCESSED}`);
        
        await axios.post(N8N_WEBHOOK_PROCESSED, processedResult);

        console.log('✅ Successfully processed and sent to n8n');
        console.log('========================================\n');

        res.json({
            success: true,
            message: 'Clip processed successfully',
            data: {
                clipId,
                videoWithSubtitlesUrl: processedResult.videoWithSubtitlesUrl,
                transcriptPublicId: processedResult.transcriptPublicId,
            },
        });
    } catch (error) {
        console.error('\n❌ ERROR PROCESSING CLIP:', error.message);
        console.error(error.stack);
        console.log('========================================\n');

        res.status(500).json({ success: false, error: error.message, clipData });
    } finally {
        if (tempFilePath) cleanupFile(tempFilePath);
    }
});

/**
 * @swagger
 * /process-clips-batch:
 *   post:
 *     summary: Process and transcribe multiple video clips in batch
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               clips:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     public_id:
 *                       type: string
 *                     secure_url:
 *                       type: string
 *                     new_public_id:
 *                       type: string
 *                     start_time:
 *                       type: number
 *                     clip_duration:
 *                       type: number
 *     responses:
 *       200:
 *         description: Batch processing result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 processed:
 *                   type: integer
 *                 failed:
 *                   type: integer
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       clipId:
 *                         type: string
 *                       status:
 *                         type: string
 *                       videoWithSubtitlesUrl:
 *                         type: string
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       clipId:
 *                         type: string
 *                       error:
 *                         type: string
 */
app.post('/process-clips-batch', async (req, res) => {
    const clips = req.body.clips || [];
    console.log(`\n📦 BATCH PROCESSING: ${clips.length} clips`);

    const results = [];
    const errors = [];

    for (const clipData of clips) {
        let tempFilePath = null;
        try {
            const clipUrl = clipData.secure_url || clipData.url;
            const clipId = clipData.new_public_id || clipData.public_id || `clip_${Date.now()}`;

            tempFilePath = await downloadClip(clipUrl, clipId);
            const processedResult = await uploadWithTranscription(tempFilePath, clipData);

            await axios.post(N8N_WEBHOOK_PROCESSED, processedResult);

            results.push({
                clipId,
                status: 'success',
                videoWithSubtitlesUrl: processedResult.videoWithSubtitlesUrl,
            });
        } catch (error) {
            console.error(`❌ Failed to process clip: ${error.message}`);
            errors.push({ clipId: clipData.new_public_id || clipData.public_id, error: error.message });
        } finally {
            if (tempFilePath) cleanupFile(tempFilePath);
        }
    }

    res.json({
        success: true,
        processed: results.length,
        failed: errors.length,
        results,
        errors,
    });
});

const PORT = process.env.PORT || 3000;

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Video Clip Transcription API',
      version: '1.0.0',
      description: 'API for processing and transcribing video clips via Cloudinary and n8n',
    },
    servers: [{ url: `http://localhost:${PORT}`, description: 'Local server' }],
  },
  apis: ['server.js'],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.listen(PORT, () => {
    console.log(`🚀 Video Clip Transcription Service started on port ${PORT}`);
    console.log(`🔗 Swagger UI available at http://localhost:${PORT}/api-docs`);
});
