import { InstitutionProfile } from '../models/InstitutionProfile.js';

export async function getProfile(req, res) {
  let profile = await InstitutionProfile.findOne({ institutionId: req.institutionId });
  if (!profile) {
    // If not found, return empty profile structure
    return res.json({
      success: true,
      data: {
        institutionName: req.institution?.name || '',
        logoUrl: '',
        address: '',
        contactInfo: '',
        website: '',
        defaultHeader: '',
        defaultFooter: ''
      }
    });
  }
  res.json({ success: true, data: profile });
}

export async function upsertProfile(req, res) {
  if (!['INSTITUTION_ADMIN', 'SUPER_ADMIN'].includes(req.membership?.role || (req.user.role === 'super_admin' ? 'SUPER_ADMIN' : ''))) return res.status(403).json({ success: false, error: { message: 'Institution administrator access required', code: 'FORBIDDEN' } });
  const query = { institutionId: req.institutionId };
  const update = {
    ...req.body,
    createdBy: req.user._id,
    institutionId: req.institutionId,
  };
  const options = { new: true, upsert: true };
  const profile = await InstitutionProfile.findOneAndUpdate(query, update, options);
  res.json({ success: true, data: profile });
}
