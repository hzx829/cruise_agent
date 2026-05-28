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
    <div className="max-w-full overflow-hidden rounded-xl border border-purple-200 bg-purple-50/50 p-3 dark:border-purple-800 dark:bg-purple-900/20 sm:p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Sparkles className="size-4 shrink-0 text-purple-500" />
        <span className="text-sm font-semibold text-purple-700 dark:text-purple-300">
          小红书文案素材
        </span>
        <span className="break-words text-xs text-purple-400 dark:text-purple-500">{data.style}</span>
      </div>

      <div className="mb-2 space-y-0.5 text-xs text-muted-foreground">
        <p className="break-words">
          📍 {data.deal.brand} | {data.deal.destination} | {data.deal.duration}
        </p>
        <p className="break-words">
          💰 {data.deal.currency === 'CNY' ? '¥' : '$'}
          {data.deal.price.toLocaleString()}
        </p>
      </div>

      {generatedText && (
        <div className="relative mt-3">
          <button
            onClick={handleCopy}
            className="absolute right-2 top-2 rounded-lg bg-background/80 p-1.5 shadow-sm transition-colors hover:bg-background"
            title="复制文案"
          >
            {copied ? (
              <Check className="size-3.5 text-green-500" />
            ) : (
              <Copy className="size-3.5 text-muted-foreground" />
            )}
          </button>
          <div className="whitespace-pre-wrap break-words rounded-lg bg-card p-3 pr-10 text-sm leading-relaxed text-card-foreground">
            {generatedText}
          </div>
        </div>
      )}
    </div>
  );
}
