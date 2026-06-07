import { useState, useEffect } from 'react';
import { Card, Button, Input, Textarea, Alert, PageHeader, Loading } from '../../components/ui';
import { fetchInstitutionProfileApi, saveInstitutionProfileApi } from '../../api/papers';
import type { InstitutionProfile } from '../../types';

export function InstitutionProfilePage() {
  const [profile, setProfile] = useState<Partial<InstitutionProfile>>({
    institutionName: '',
    logoUrl: '',
    address: '',
    contactInfo: '',
    website: '',
    defaultHeader: '',
    defaultFooter: ''
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    async function loadProfile() {
      try {
        const data = await fetchInstitutionProfileApi();
        if (data) {
          setProfile(data);
        }
      } catch (err) {
        console.error('Failed to load institution profile', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadProfile();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setMessage(null);
    try {
      const saved = await saveInstitutionProfileApi(profile);
      setProfile(saved);
      setMessage({ type: 'success', text: 'Institution profile saved successfully.' });
    } catch (err) {
      console.error('Failed to save profile', err);
      setMessage({ type: 'error', text: 'Failed to save institution profile.' });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loading size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader 
        title="Institution Profile" 
        subtitle="Configure your institutional branding defaults used during paper publishing and export." 
      />

      {message && (
        <Alert variant={message.type} title={message.text} />
      )}

      <form onSubmit={handleSave} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="p-6 space-y-4 shadow-sm border border-slate-200">
            <h3 className="text-lg font-bold text-slate-800 border-b pb-2">Branding & Identity</h3>
            
            <Input
              label="Institution Name"
              required
              placeholder="e.g. Apex Institute of Science"
              value={profile.institutionName || ''}
              onChange={(e) => setProfile({ ...profile, institutionName: e.target.value })}
            />

            <Input
              label="Logo Image URL"
              placeholder="e.g. /uploads/logo.png"
              value={profile.logoUrl || ''}
              onChange={(e) => setProfile({ ...profile, logoUrl: e.target.value })}
            />

            {profile.logoUrl && (
              <div className="mt-2 p-3 bg-slate-50 rounded border flex items-center gap-3">
                <span className="text-xs text-slate-500 font-semibold uppercase">Logo Preview:</span>
                <img 
                  src={profile.logoUrl} 
                  alt="Logo Preview" 
                  className="h-10 object-contain rounded bg-white p-1 border"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = 'https://placehold.co/100x100?text=Logo';
                  }}
                />
              </div>
            )}

            <Input
              label="Website URL"
              placeholder="e.g. https://www.apex-institute.com"
              value={profile.website || ''}
              onChange={(e) => setProfile({ ...profile, website: e.target.value })}
            />
          </Card>

          <Card className="p-6 space-y-4 shadow-sm border border-slate-200">
            <h3 className="text-lg font-bold text-slate-800 border-b pb-2">Contact & Address</h3>
            
            <Textarea
              label="Contact Information"
              placeholder="e.g. Phone: +91 9876543210, Email: contact@apex.edu"
              value={profile.contactInfo || ''}
              onChange={(e) => setProfile({ ...profile, contactInfo: e.target.value })}
              rows={3}
            />

            <Textarea
              label="Physical Address"
              placeholder="e.g. Apex Tower, Sector 62, Noida, Uttar Pradesh, 201301"
              value={profile.address || ''}
              onChange={(e) => setProfile({ ...profile, address: e.target.value })}
              rows={4}
            />
          </Card>
        </div>

        <Card className="p-6 space-y-4 shadow-sm border border-slate-200">
          <h3 className="text-lg font-bold text-slate-800 border-b pb-2">Publishing & Export Defaults</h3>
          <p className="text-xs text-slate-500">
            These values will automatically populate the page margins, header and footer sections when you export a question paper, unless overridden manually.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Textarea
              label="Default Header Instructions/Text"
              placeholder="General instructions visible at the top of question sheets."
              value={profile.defaultHeader || ''}
              onChange={(e) => setProfile({ ...profile, defaultHeader: e.target.value })}
              rows={4}
            />

            <Textarea
              label="Default Footer Disclaimer/Note"
              placeholder="e.g. CONFIDENTIAL — For Internal Institutional Use Only"
              value={profile.defaultFooter || ''}
              onChange={(e) => setProfile({ ...profile, defaultFooter: e.target.value })}
              rows={4}
            />
          </div>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="submit" isLoading={isSaving} variant="primary" className="px-6 py-2">
            Save Profile Settings
          </Button>
        </div>
      </form>
    </div>
  );
}
