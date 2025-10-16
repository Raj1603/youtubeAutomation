import express from 'express';
import { processClip, processClipsBatch } from '../controllers/clipController.js';

const router = express.Router();
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
router.post('/process-clip', processClip);

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
router.post('/process-clips-batch', processClipsBatch);

export default router;
