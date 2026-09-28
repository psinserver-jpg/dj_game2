import React from 'react';

interface StageBackdropProps {
  imageUrl: string;
  blur?: boolean;
}

/** Full-screen stage artwork behind menu screens; content must sit above it (relative z-10). */
export const StageBackdrop: React.FC<StageBackdropProps> = ({ imageUrl, blur = true }) => (
  <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden="true">
    <img
      key={imageUrl}
      src={imageUrl}
      alt=""
      className={`absolute inset-0 w-full h-full object-cover animate-backdrop-in ${
        blur ? 'scale-110 blur-md' : ''
      }`}
    />
    <div className="absolute inset-0 bg-[#080b12]/60" />
    <div className="absolute inset-0 bg-gradient-to-t from-[#080b12] via-transparent to-[#080b12]/60" />
  </div>
);
