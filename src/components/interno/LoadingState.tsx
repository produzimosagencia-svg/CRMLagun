import { useEffect, useState } from 'react';

interface LoadingStateProps {
  label?: string;
}

export default function LoadingState({ label = 'dados' }: LoadingStateProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-64 gap-4">
      <div className="h-8 w-8 border-2 border-[#FF0080] border-t-transparent rounded-full animate-spin" />
      <div className="text-center">
        <p className="text-sm font-medium text-gray-600">
          Carregando {label}.
        </p>
        <p className="text-xs text-gray-400 mt-1">Isso pode demorar um pouco...</p>
        {elapsed >= 8 && (
          <p className="text-xs text-gray-400 mt-2 animate-pulse">
            Ainda carregando — aguarde mais um momento...
          </p>
        )}
      </div>
    </div>
  );
}
