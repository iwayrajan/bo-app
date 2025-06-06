import React from 'react';

interface ReactionPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export const ReactionPicker: React.FC<ReactionPickerProps> = ({ onSelect, onClose }) => {
  const handleEmojiSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const emoji = e.target.value;
    if (emoji) {
      onSelect(emoji);
      onClose();
      // Reset the input value
      e.target.value = '';
    }
  };

  return (
    <div className="absolute bottom-full mb-2 bg-white rounded-lg shadow-lg p-2 border border-gray-200">
      <input
        type="text"
        inputMode="text"
        onChange={handleEmojiSelect}
        className="w-full px-2 py-1 border rounded text-sm"
        placeholder="Tap to open emoji picker..."
        autoFocus
      />
    </div>
  );
}; 