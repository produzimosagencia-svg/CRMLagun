import { useState } from 'react';
import { motion } from 'framer-motion';

// Simplified SVG paths for major ES cities/regions
// Based on ES municipal boundaries - simplified polygons
const ES_CITIES: { name: string; path: string; cx: number; cy: number }[] = [
  { name: 'Vitória', path: 'M158,280 L168,275 L175,282 L170,290 L160,288Z', cx: 166, cy: 283 },
  { name: 'Vila Velha', path: 'M150,288 L165,290 L170,300 L155,305 L145,298Z', cx: 157, cy: 296 },
  { name: 'Serra', path: 'M150,260 L175,255 L180,270 L170,280 L155,278Z', cx: 165, cy: 268 },
  { name: 'Cariacica', path: 'M130,275 L155,270 L158,285 L150,295 L128,290Z', cx: 144, cy: 283 },
  { name: 'Viana', path: 'M115,280 L135,275 L138,295 L125,300 L110,292Z', cx: 125, cy: 288 },
  { name: 'Guarapari', path: 'M140,305 L160,300 L165,315 L150,325 L135,318Z', cx: 150, cy: 312 },
  { name: 'Cachoeiro de Itapemirim', path: 'M95,345 L120,335 L130,350 L115,365 L90,358Z', cx: 110, cy: 350 },
  { name: 'Linhares', path: 'M120,195 L160,185 L175,205 L155,220 L125,215Z', cx: 147, cy: 204 },
  { name: 'Colatina', path: 'M80,190 L115,180 L125,200 L105,215 L75,208Z', cx: 100, cy: 198 },
  { name: 'São Mateus', path: 'M130,130 L170,120 L180,145 L160,160 L135,155Z', cx: 155, cy: 142 },
  { name: 'Aracruz', path: 'M145,230 L170,225 L178,245 L162,255 L148,250Z', cx: 160, cy: 241 },
  { name: 'Nova Venécia', path: 'M70,135 L105,125 L115,150 L95,163 L65,155Z', cx: 90, cy: 146 },
  { name: 'Domingos Martins', path: 'M100,270 L125,262 L130,280 L115,290 L95,285Z', cx: 113, cy: 277 },
  { name: 'Anchieta', path: 'M130,320 L150,315 L155,332 L140,340 L125,335Z', cx: 140, cy: 328 },
  { name: 'Alegre', path: 'M75,360 L100,352 L108,370 L90,380 L70,375Z', cx: 89, cy: 367 },
  { name: 'Itapemirim', path: 'M115,365 L140,358 L148,375 L130,385 L110,380Z', cx: 128, cy: 372 },
  { name: 'Marataízes', path: 'M125,385 L150,378 L155,395 L140,402 L120,398Z', cx: 138, cy: 391 },
  // Fill regions for the outline
  { name: 'Norte (outros)', path: 'M50,80 L130,60 L175,100 L170,125 L130,135 L70,140 L45,120Z', cx: 110, cy: 100 },
  { name: 'Noroeste (outros)', path: 'M30,120 L70,140 L75,175 L60,200 L30,195 L20,165Z', cx: 50, cy: 165 },
  { name: 'Centro-Oeste (outros)', path: 'M35,200 L75,208 L80,240 L70,265 L40,260 L30,235Z', cx: 55, cy: 233 },
  { name: 'Sul (outros)', path: 'M35,265 L75,260 L95,285 L90,320 L75,345 L50,340 L30,310Z', cx: 60, cy: 305 },
  { name: 'Extremo Sul (outros)', path: 'M45,340 L75,345 L90,380 L100,400 L75,415 L50,405 L35,380Z', cx: 67, cy: 380 },
  { name: 'Litoral Norte (outros)', path: 'M170,100 L195,90 L200,135 L195,175 L175,185 L165,160 L170,125Z', cx: 183, cy: 140 },
];

interface Props {
  cityData: { name: string; count: number }[];
}

export function EspiritoSantoMap({ cityData }: Props) {
  const [hoveredCity, setHoveredCity] = useState<string | null>(null);
  const maxCount = Math.max(...cityData.map(c => c.count), 1);

  function getCityCount(name: string): number {
    const city = cityData.find(c => c.name.toLowerCase() === name.toLowerCase());
    return city?.count || 0;
  }

  function getHeatColor(name: string): string {
    const count = getCityCount(name);
    if (count === 0) return '#f3f4f6';
    const intensity = count / maxCount;
    if (intensity > 0.7) return '#FF0080';
    if (intensity > 0.4) return '#FF5CAD';
    if (intensity > 0.15) return '#FFB3D9';
    return '#FFE0F0';
  }

  const hoveredData = hoveredCity ? cityData.find(c => c.name.toLowerCase() === hoveredCity.toLowerCase()) : null;

  return (
    <div className="relative">
      {/* Tooltip */}
      {hoveredCity && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full bg-gray-900 text-white text-xs px-3 py-1.5 rounded-lg shadow-lg z-10 whitespace-nowrap"
        >
          {hoveredCity}: {hoveredData?.count || 0} clientes
        </motion.div>
      )}

      <svg
        viewBox="0 20 220 420"
        className="w-full h-auto max-h-[350px]"
        xmlns="http://www.w3.org/2000/svg"
      >
        {ES_CITIES.map((city) => (
          <motion.path
            key={city.name}
            d={city.path}
            fill={getHeatColor(city.name)}
            stroke="white"
            strokeWidth="1.5"
            className="cursor-pointer transition-colors"
            onMouseEnter={() => setHoveredCity(city.name)}
            onMouseLeave={() => setHoveredCity(null)}
            whileHover={{ scale: 1.03, originX: '50%', originY: '50%' }}
          />
        ))}
      </svg>

      {/* Legend */}
      <div className="flex items-center justify-center gap-2 mt-3 text-xs text-gray-500">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm bg-[#FFE0F0]" />
          <span>Baixo</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm bg-[#FFB3D9]" />
          <span>Médio</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm bg-[#FF5CAD]" />
          <span>Alto</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm bg-[#FF0080]" />
          <span>Muito alto</span>
        </div>
      </div>
    </div>
  );
}
