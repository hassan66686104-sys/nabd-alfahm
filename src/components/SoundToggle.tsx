import { useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { setSoundOn, sfx, soundOn } from '@/lib/sound';
import { cx } from './ui';

export default function SoundToggle({ className }: { className?: string }) {
  const [on, setOn] = useState(soundOn);
  return (
    <button type="button" onClick={() => { const v = !on; setSoundOn(v); setOn(v); if (v) sfx.correct(); }}
      className={cx('rounded-lg p-1.5 hover:bg-white/10', className)} aria-pressed={on} aria-label={on ? 'كتم الصوت' : 'تشغيل الصوت'} title={on ? 'كتم الصوت' : 'تشغيل الصوت'}>
      {on ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
    </button>
  );
}
