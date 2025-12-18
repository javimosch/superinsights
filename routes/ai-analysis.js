const express = require('express');

const router = express.Router();

const { ensureAuthenticated } = require('../middleware/auth');
const presetsController = require('../controllers/aiAnalysisPresetsController');

router.use(ensureAuthenticated);

router.get('/presets', presetsController.getPresets);
router.post('/presets/ai-generate', presetsController.postAiGeneratePreset);
router.post('/presets', presetsController.postCreatePreset);
router.get('/presets/:presetId', presetsController.getPreset);
router.post('/presets/:presetId/ai-refine', presetsController.postAiRefinePreset);
router.put('/presets/:presetId', presetsController.putUpdatePreset);
router.delete('/presets/:presetId', presetsController.deletePreset);
router.post('/presets/:presetId/publish', presetsController.postPublishPreset);
router.post('/presets/:presetId/unpublish', presetsController.postUnpublishPreset);

module.exports = router;
