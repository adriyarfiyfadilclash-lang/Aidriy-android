import { useRef } from 'react';
import { Camera, FileUp, FolderClosed, Globe, Image as ImageIcon } from 'lucide-react';
import { isNative, tap } from '../lib/native';
import { Group, Row, Sheet, Toggle } from './ui';

export default function AttachSheet({ open, onClose, onFiles, onCamera, webSearch, onWebSearch, projectName, onPickProject }) {
  const photoRef = useRef();
  const fileRef = useRef();
  const camRef = useRef();

  const handle = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length) {
      onClose();
      onFiles(files);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Tambahkan ke chat">
      <div className="tiles">
        <button
          type="button"
          className="tile"
          onClick={() => {
            tap();
            if (isNative) {
              onClose();
              onCamera();
            } else camRef.current?.click();
          }}
        >
          <span className="tile-icon">
            <Camera size={26} strokeWidth={1.6} />
          </span>
          Kamera
        </button>
        <button type="button" className="tile" onClick={() => photoRef.current?.click()}>
          <span className="tile-icon">
            <ImageIcon size={26} strokeWidth={1.6} />
          </span>
          Foto
        </button>
        <button type="button" className="tile" onClick={() => fileRef.current?.click()}>
          <span className="tile-icon">
            <FileUp size={26} strokeWidth={1.6} />
          </span>
          File
        </button>
      </div>
      <input ref={photoRef} type="file" accept="image/*" multiple hidden onChange={handle} />
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={handle} />
      <input
        ref={fileRef}
        type="file"
        multiple
        hidden
        accept="image/*,application/pdf,text/*,.md,.csv,.json,.xml,.html,.css,.js,.jsx,.ts,.tsx,.py,.java,.kt,.c,.cpp,.h,.cs,.go,.rs,.php,.rb,.sql,.yaml,.yml,.toml,.sh,.swift,.dart,.log"
        onChange={handle}
      />

      <Group>
        <Row
          icon={<Globe size={24} strokeWidth={1.6} />}
          title="Pencarian web"
          subtitle="AI boleh mencari informasi terbaru"
          right={<Toggle checked={webSearch} onChange={onWebSearch} label="Pencarian web" />}
          onClick={() => onWebSearch(!webSearch)}
        />
        {onPickProject && (
          <Row
            icon={<FolderClosed size={24} strokeWidth={1.6} />}
            title="Proyek"
            subtitle={projectName || 'Tanpa proyek'}
            chevron
            onClick={onPickProject}
          />
        )}
      </Group>
    </Sheet>
  );
}
