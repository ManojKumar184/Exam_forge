import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { Card, Button, Input, Alert, PageHeader } from '../../components/ui';

export function SettingsPage() {
  const { profile, updateProfile } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [school, setSchool] = useState(profile?.school_institute || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);
    const { error } = await updateProfile({
      full_name: fullName,
      school_institute: school,
      phone,
    });
    setIsSaving(false);
    if (error) {
      setMessage('Failed to update profile.');
    } else {
      setMessage('Profile updated successfully.');
    }
  };

  return (
    <div className="space-y-6 max-w-xl">
      <PageHeader title="Settings" subtitle="Manage your account profile" />

      {message && (
        <Alert variant={message.includes('success') ? 'success' : 'error'} title={message} />
      )}

      <Card className="p-6 space-y-4">
        <Input label="Email" value={profile?.email || ''} disabled />
        <Input
          label="Full name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
        <Input
          label="School / Institute"
          value={school}
          onChange={(e) => setSchool(e.target.value)}
        />
        <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <Button onClick={handleSave} isLoading={isSaving}>
          Save changes
        </Button>
      </Card>
    </div>
  );
}
