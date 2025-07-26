import React from 'react';

interface LoadingIndicatorProps {
  message?: string;
  size?: 'small' | 'medium' | 'large';
  inline?: boolean;
  className?: string;
}

const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({ 
  message = 'Loading data from blockchain...', 
  size = 'medium',
  inline = false,
  className = ''
}) => {
  const sizeClass = {
    small: 'loader-small',
    medium: 'loader-medium',
    large: 'loader-large'
  }[size];

  return (
    <div className={`loading-container ${inline ? 'inline' : ''} ${className}`}>
      <div className={`loader ${sizeClass}`}></div>
      {message && <p className="loading-message">{message}</p>}
    </div>
  );
};

export default LoadingIndicator;
