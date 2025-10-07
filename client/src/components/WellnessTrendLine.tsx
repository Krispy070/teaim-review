import { useMemo } from "react";

interface WellnessTrendLineProps {
  data: {
    created_at: string;
    score: number;
  }[];
  priorData?: {
    created_at: string;
    score: number;
  }[];
  height?: number;
  showDates?: boolean;
  showMovingAverage?: boolean;
  movingAverageWindow?: number;
}

export default function WellnessTrendLine({ 
  data, 
  priorData,
  height = 120, 
  showDates = false,
  showMovingAverage = false,
  movingAverageWindow = 3
}: WellnessTrendLineProps) {
  const chartData = useMemo(() => {
    if (!data.length) return { 
      points: [], dates: [], minScore: 1, maxScore: 5, width: 300, chartHeight: height - 20,
      priorPoints: [], movingAveragePoints: []
    };

    // Sort by date (oldest first for left-to-right timeline)
    const sorted = [...data].sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    const scores = sorted.map(item => item.score);
    const dates = sorted.map(item => {
      const date = new Date(item.created_at);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    // Process prior data if available
    let priorScores: number[] = [];
    let priorDates: string[] = [];
    if (priorData && priorData.length > 0) {
      const priorSorted = [...priorData].sort((a, b) => 
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      priorScores = priorSorted.map(item => item.score);
      priorDates = priorSorted.map(item => {
        const date = new Date(item.created_at);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      });
    }

    // Calculate moving average
    let movingAverageScores: number[] = [];
    if (showMovingAverage && scores.length >= movingAverageWindow) {
      for (let i = movingAverageWindow - 1; i < scores.length; i++) {
        const window = scores.slice(i - movingAverageWindow + 1, i + 1);
        const avg = window.reduce((sum, score) => sum + score, 0) / window.length;
        movingAverageScores.push(avg);
      }
    }

    // Determine score range including all data
    const allScores = [...scores, ...priorScores, ...movingAverageScores].filter(s => s != null);
    const minScore = Math.max(1, Math.min(...allScores) - 0.5);
    const maxScore = Math.min(5, Math.max(...allScores) + 0.5);
    const scoreRange = maxScore - minScore;

    // Calculate SVG dimensions
    const width = 300;
    const chartHeight = height - (showDates ? 40 : 20);
    
    // Calculate current period points
    const points = scores.map((score, index) => {
      const x = (index / Math.max(scores.length - 1, 1)) * width;
      const y = chartHeight - ((score - minScore) / scoreRange) * chartHeight;
      return { x, y, score, date: dates[index] };
    });

    // Calculate prior period points
    const priorPoints = priorScores.map((score, index) => {
      const x = (index / Math.max(priorScores.length - 1, 1)) * width;
      const y = chartHeight - ((score - minScore) / scoreRange) * chartHeight;
      return { x, y, score, date: priorDates[index] };
    });

    // Calculate moving average points
    const movingAveragePoints = movingAverageScores.map((score, index) => {
      const originalIndex = index + movingAverageWindow - 1;
      const x = (originalIndex / Math.max(scores.length - 1, 1)) * width;
      const y = chartHeight - ((score - minScore) / scoreRange) * chartHeight;
      return { x, y, score, date: dates[originalIndex] };
    });

    return { points, dates, minScore, maxScore, width, chartHeight, priorPoints, movingAveragePoints };
  }, [data, priorData, height, showDates, showMovingAverage, movingAverageWindow]);

  if (!data.length) {
    return (
      <div 
        className="flex items-center justify-center text-muted-foreground text-sm border rounded-lg bg-muted/20"
        style={{ height }}
        data-testid="wellness-trend-empty"
      >
        No wellness data available
      </div>
    );
  }

  const { points, minScore, maxScore, width, chartHeight, priorPoints, movingAveragePoints } = chartData;

  // Create SVG paths for all lines
  const pathData = points.map((point, index) => 
    `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`
  ).join(' ');

  const priorPathData = priorPoints.length > 0 ? priorPoints.map((point, index) => 
    `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`
  ).join(' ') : '';

  const movingAveragePathData = movingAveragePoints.length > 0 ? movingAveragePoints.map((point, index) => 
    `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`
  ).join(' ') : '';

  // Determine overall trend
  const trendColor = (() => {
    if (points.length < 2) return "stroke-blue-500";
    const first = points[0].score;
    const last = points[points.length - 1].score;
    if (last > first + 0.5) return "stroke-green-500";
    if (last < first - 0.5) return "stroke-red-500";
    return "stroke-blue-500";
  })();

  return (
    <div 
      className="relative border rounded-lg bg-white dark:bg-gray-900 p-3"
      style={{ height }}
      data-testid="wellness-trend-line"
    >
      {/* Chart Title with Legend */}
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-muted-foreground font-medium">
          Wellness Trend ({data.length} check-ins)
        </div>
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-3 h-0.5 bg-blue-500"></div>
            <span className="text-muted-foreground">Current</span>
          </div>
          {priorPoints.length > 0 && (
            <div className="flex items-center gap-1">
              <div className="w-3 h-0.5 bg-gray-400" style={{ backgroundImage: 'repeating-linear-gradient(to right, transparent 0px, transparent 2px, currentColor 2px, currentColor 4px)' }}></div>
              <span className="text-muted-foreground">Prior</span>
            </div>
          )}
          {showMovingAverage && movingAveragePoints.length > 0 && (
            <div className="flex items-center gap-1">
              <div className="w-3 h-0.5 bg-amber-500"></div>
              <span className="text-muted-foreground">Avg</span>
            </div>
          )}
        </div>
      </div>

      {/* SVG Line Chart */}
      <div className="relative">
        <svg 
          width={width} 
          height={chartHeight} 
          className="overflow-visible"
          viewBox={`0 0 ${width} ${chartHeight}`}
        >
          {/* Grid lines */}
          {[1, 2, 3, 4, 5].map(score => {
            const y = chartHeight - ((score - minScore) / (maxScore - minScore)) * chartHeight;
            return (
              <line
                key={score}
                x1={0}
                y1={y}
                x2={width}
                y2={y}
                stroke="currentColor"
                strokeWidth={0.5}
                opacity={0.2}
              />
            );
          })}

          {/* Prior period line (dotted) */}
          {priorPathData && (
            <path
              d={priorPathData}
              fill="none"
              strokeWidth={2}
              stroke="#9CA3AF"
              strokeDasharray="4,3"
              opacity={0.7}
              data-testid="prior-trend-line"
            />
          )}

          {/* Prior period points */}
          {priorPoints.map((point, index) => (
            <circle
              key={`prior-${index}`}
              cx={point.x}
              cy={point.y}
              r={2}
              fill="#9CA3AF"
              opacity={0.7}
              data-testid={`prior-point-${index}`}
            >
              <title>{`Prior ${point.date}: ${point.score}/5`}</title>
            </circle>
          ))}

          {/* Current period trend line */}
          <path
            d={pathData}
            fill="none"
            strokeWidth={2}
            className={`${trendColor} transition-colors duration-200`}
            data-testid="current-trend-line"
          />

          {/* Moving average line */}
          {showMovingAverage && movingAveragePathData && (
            <path
              d={movingAveragePathData}
              fill="none"
              strokeWidth={2}
              stroke="#F59E0B"
              opacity={0.8}
              data-testid="moving-average-line"
            />
          )}

          {/* Current period data points */}
          {points.map((point, index) => (
            <circle
              key={index}
              cx={point.x}
              cy={point.y}
              r={3}
              className={`${trendColor.replace('stroke-', 'fill-')} transition-colors duration-200`}
              data-testid={`current-point-${index}`}
            >
              <title>{`${point.date}: ${point.score}/5`}</title>
            </circle>
          ))}

          {/* Moving average points */}
          {showMovingAverage && movingAveragePoints.map((point, index) => (
            <circle
              key={`ma-${index}`}
              cx={point.x}
              cy={point.y}
              r={2}
              fill="#F59E0B"
              opacity={0.8}
              data-testid={`moving-average-point-${index}`}
            >
              <title>{`Moving Avg ${point.date}: ${point.score.toFixed(1)}/5`}</title>
            </circle>
          ))}
        </svg>

        {/* Y-axis labels */}
        <div className="absolute left-0 top-0 h-full flex flex-col justify-between text-xs text-muted-foreground pointer-events-none">
          <span>5</span>
          <span>3</span>
          <span>1</span>
        </div>
      </div>

      {/* Date labels */}
      {showDates && points.length > 1 && (
        <div className="flex justify-between text-xs text-muted-foreground mt-2">
          <span>{points[0].date}</span>
          {points.length > 2 && (
            <span className="opacity-60">
              {points[Math.floor(points.length / 2)].date}
            </span>
          )}
          <span>{points[points.length - 1].date}</span>
        </div>
      )}
    </div>
  );
}