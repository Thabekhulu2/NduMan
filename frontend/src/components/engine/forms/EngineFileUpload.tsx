/**
 * File Upload Component - Single-file input storing the File in page state
 */

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { EngineComponentProps, ActionDefinition } from '@/engine/types';
import { useUIEngine } from '@/engine/UIEngineContext';

interface EngineFileUploadProps extends EngineComponentProps {
  onChange?: ActionDefinition;
  accept?: string;
  label?: string;
  name?: string;
  fileName?: string;
  disabled?: boolean;
  className?: string;
}

export function EngineFileUpload({
  onChange,
  accept,
  label,
  name,
  fileName,
  disabled = false,
  className,
}: EngineFileUploadProps) {
  const { dispatch } = useUIEngine();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (onChange) {
      dispatch(onChange, { event: e });
    }
  };

  const inputId = name || `file-${Math.random().toString(36).slice(2, 9)}`;

  return (
    <div className={cn('space-y-2', className)}>
      {label && <Label htmlFor={inputId}>{label}</Label>}
      <Input
        id={inputId}
        type="file"
        name={name}
        accept={accept}
        onChange={handleChange}
        disabled={disabled}
      />
      {fileName && <p className="text-sm text-muted-foreground">Selected: {fileName}</p>}
    </div>
  );
}
