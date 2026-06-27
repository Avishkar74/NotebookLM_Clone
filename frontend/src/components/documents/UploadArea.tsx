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
            ? "border-blue-400 bg-blue-50 shadow-lg shadow-blue-100/60" 
            : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100/70"
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
            <Loader className="h-8 w-8 text-blue-600 animate-spin" />
            <span className="text-xs font-semibold text-slate-700">Queuing files...</span>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="mx-auto w-12 h-12 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-500 group-hover:text-blue-600 transition duration-300">
              <Upload className="h-6 w-6" />
            </div>
            <div>
              <span className="block text-xs font-semibold text-slate-800">
                Drag & drop files or <span className="text-blue-700 hover:text-blue-800">browse</span>
              </span>
              <span className="block text-[10px] text-slate-500 mt-1">
                Supports PDF or TXT up to 50MB
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
