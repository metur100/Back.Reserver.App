import { Eye, EyeOff } from 'lucide-react';
import { forwardRef, useState, type InputHTMLAttributes } from 'react';
import { Input } from '@/components/ui/input';
import { t } from '@/i18n';

export const PasswordInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>((props, ref) => {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input ref={ref} type={visible ? 'text' : 'password'} className="pr-12" {...props} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute top-0 right-0 inline-flex size-11 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
        aria-label={visible ? t('app.hidePassword') : t('app.showPassword')}
        aria-pressed={visible}
      >
        {visible ? <EyeOff className="size-5" aria-hidden="true" /> : <Eye className="size-5" aria-hidden="true" />}
      </button>
    </div>
  );
});
PasswordInput.displayName = 'PasswordInput';
