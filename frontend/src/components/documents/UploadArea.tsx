import { useRef, useState } from "react";
import { Upload, Loader } from "lucide-react";
import { useDocuments } from "../../hooks/useDocuments";

export const UploadArea = () => {
  const { uploadFiles } = useDocuments();
  const [isDragActive, setIsDragActive] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setIsUploading(true);
      await uploadFiles(e.dataTransfer.files);
      setIsUploading(false);
    }
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setIsUploading(true);
      await uploadFiles(e.target.files);
      setIsUploading(false);
    }
  };

  const onButtonClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="p-4 shrink-0">
      <div
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={onButtonClick}
        className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all duration-300 relative overflow-hidden ${
          isDragActive 
            ? "border-primary bg-primary/10 shadow-lg shadow-primary/5" 
            : "border-neutral-800 bg-neutral-900/30 hover:border-neutral-700 hover:bg-neutral-900/40"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.txt"
          onChange={handleFileInput}
          className="hidden"
        />
        
        {isUploading ? (
          <div className="flex flex-col items-center justify-center space-y-2 py-2">
            <Loader className="h-8 w-8 text-primary animate-spin" />
            <span className="text-xs font-semibold text-neutral-300">Queuing files...</span>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="mx-auto w-12 h-12 rounded-xl bg-neutral-800/80 border border-neutral-700/50 flex items-center justify-center text-neutral-400 group-hover:text-primary transition duration-300">
              <Upload className="h-6 w-6" />
            </div>
            <div>
              <span className="block text-xs font-semibold text-neutral-200">
                Drag & drop files or <span className="text-primary hover:text-primary-light">browse</span>
              </span>
              <span className="block text-[10px] text-neutral-500 mt-1">
                Supports PDF or TXT up to 50MB
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
