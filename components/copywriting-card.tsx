'use client';

import { Copy, Check, Sparkles } from 'lucide-react';
import { useState } from 'react';

interface CopywritingData {
  deal: {
    brand: string;
    dealName: string;
    shipName?: string;
    destination?: string;
    duration?: string;
    price: number;
    currency?: string;
    url?: string;
  };
  style: string;
  instruction: string;
}

export function CopywritingCard({
  data,
  generatedText,
}: {
  data: CopywritingData;
  generatedText?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (generatedText) {
      await navigator.clipboard.writeText(generatedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="rounded-lg border border-purple-200 bg-purple-50/50 p-4">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="w-4 h-4 text-purple-500" />
        <span className="text-sm font-semibold text-purple-700">
          小红书文案素材
        </span>
        <span className="text-xs text-purple-400">{data.style}</span>
      </div>

      <div className="text-xs text-gray-600 mb-2 space-y-0.5">
        <p>
          📍 {data.deal.brand} | {data.deal.destination} | {data.deal.duration}
        </p>
        <p>
          💰 {data.deal.currency === 'CNY' ? '¥' : '$'}
          {data.deal.price.toLocaleString()}
        </p>
      </div>

      {generatedText && (
        <div className="relative mt-3">
          <button
            onClick={handleCopy}
            className="absolute top-2 right-2 p-1 rounded bg-white/80 hover:bg-white shadow-sm"
            title="复制文案"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-green-500" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-gray-400" />
            )}
          </button>
          <div className="bg-white rounded p-3 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
            {generatedText}
          </div>
        </div>
      )}
    </div>
  );
}
