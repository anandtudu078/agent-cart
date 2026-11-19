"use client";

import { useEffect, useState } from "react";
import { PriceHistoryEntry, UsePriceHistoryOptions } from "./use-price-history";
import { useTooltip } from "@/components/ui/tooltip";

/**
 * Line chart showing price history for a watch item.
 * Renders a simple ASCII/styled chart using chart data points.
 */
export function PriceHistoryChart({
  itemId,
  limit,
  kind,
}: Pick<UsePriceHistoryOptions, "itemId" | "limit" | "kind">) {
  const { entries, loading, error, refetch } = usePriceHistory({ itemId, limit, kind });
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipIndex, setTooltipIndex] = useState<number | null>(null);

  // Extract price points from entries
  const pricePoints = entries.map((entry, index) => ({
    x: index,
    y: entry.price ?? null,
    label: entry.occurredAt,
    kind: entry.kind,
  }));

  // Format entries for display - show last N entries
  const displayedEntries = entries.slice(-15); // last 15 entries

  if (loading) {
    return (
      <div className="h-24 flex items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-24 text-sm text-error flex items-center justify-center">
        {error}
      </div>
    );
  }

  if (displayedEntries.length === 0) {
    return (
      <div className="h-24 text-sm text-muted-foreground text-center">
        No price history yet.
      </div>
    );
  }

  // Calculate min/max prices for scaling (ignore null values)
  const validPrices = displayedEntries
    .map((e) => e.price)
    .filter((p): p is number => typeof p === "number");

  const minPrice = validPrices.length > 0 ? Math.min(...validPrices) : 0;
  const maxPrice = validPrices.length > 0 ? Math.max(...validPrices) : 1;

  // If all prices are the same, add some range
  if (minPrice === maxPrice) {
    const range = (maxPrice || 1) * 0.1;
    minPrice = maxPrice - range;
    maxPrice = maxPrice + range;
  }

  return (
    <div className="h-64 space-y-2">
      {/* Summary line showing current price and trend */}
      {displayedEntries.length > 0 && (
        <div className="flex items-baseline justify-between text-xs text-muted-foreground">
          <span>Last: {displayedEntries[displayedEntries.length - 1].price !== undefined ? `$${displayedEntries[displayedEntries.length - 1].price}` : "N/A"}</span>
          {validPrices.length > 0 && (
            <span>
              Range: ${minPrice.toFixed(2)} – ${maxPrice.toFixed(2)}
            </span>
          )}
        </div>
      )}

      {/* Chart area */}
      <div className="h-48 relative">
        {/* Price line path */}
        {pricePoints.length > 1 && (
          <path
            className="absolute top-0 left-0 right-0 bottom-0 fill-none stroke-primary/60 stroke-1 opacity-50"
            d={`M0 ${100 -
              ((pricePoints[0]?.y ?? 0) - minPrice) /
                (maxPrice - minPrice || 1) *
                100}%
              L${pricePoints
                .map(
                  (p, i) =>
                    `${(i / (pricePoints.length - 1)) * 100}% ${
                      100 -
                      ((p?.y ?? 0) - minPrice) / (maxPrice - minPrice || 1) * 100%
                    }`
                )
                .join(" ")}`}
          />
        )}

        {/* Data points as circles */}
        {pricePoints.map((point, i) => (
          <circle
            key={i}
            cx={(i / Math.max(pricePoints.length - 1, 1)) * 100}
            cy={100 - ((point.y ?? 0) - minPrice) / (maxPrice - minPrice || 1) * 100}
            r={4}
            className="fill-primary hover:fill-primary/90 transition-colors"
            onMouseEnter={() => setTooltipIndex(i)}
            onMouseLeave={() => setTooltipIndex(null)}
          />
        ))}

        {/* Tooltip */}
        {showTooltip && tooltipIndex !== null && (
          <div
            className="absolute -top-1 left-1/2 -translate-x-1/2 bg-primary/90 text-white text-xs rounded px-2 py-1 shadow-md opacity-0 transition-opacity duration-150"
            style={{ visibility: "visible" }}
          >
            <span>{pricePoints[tooltipIndex]?.label}</span>
            <span className="ml-1">${
              pricePoints[tooltipIndex]?.y !== null
                ? `$${pricePoints[tooltipIndex]?.y}`
                : "N/A"
            }</span>
          </div>
        )}

        {/* X-axis labels - dates */}
        {displayedEntries.length > 0 && (
          <div className="flex text-xs text-muted-foreground overflow-x-auto">
            {displayedEntries.map((entry, i) => (
              <div key={i} className="w-24 text-center whitespace-nowrap">
                {new Date(entry.occurredAt).toLocaleDateString()}
              </div>
            ))}
          </div>
        )}

        {/* Y-axis price labels */}
        {validPrices.length > 0 && (
          <div className="absolute right-0 flex text-xs text-muted-foreground items-center w-16">
            {Array.from({ length: 5 }, (_, i) => {
              const t = ((i * (maxPrice - minPrice)) / 4 + minPrice).toFixed(2);
              return (
                <div key={i} className="flex-1">
                  ${t}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}