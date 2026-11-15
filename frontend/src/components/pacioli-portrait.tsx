import { cn } from '@/lib/utils';

/**
 * Retrato vetorial de Luca Pacioli em estilo gravura — traços sépia sobre
 * papel. Desenhado à mão em SVG para a identidade do produto.
 */
export function PacioliPortrait({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 240 280"
      fill="none"
      role="img"
      aria-label="Retrato de Luca Pacioli"
      className={cn('select-none', className)}
    >
      {/* Halo de fundo */}
      <circle
        cx="120"
        cy="118"
        r="98"
        stroke="currentColor"
        strokeWidth="1"
        strokeDasharray="2 6"
        opacity="0.45"
      />
      <circle cx="120" cy="118" r="86" stroke="currentColor" strokeWidth="0.75" opacity="0.25" />

      <g
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1200}
        className="animate-draw-in"
      >
        {/* Cabeça */}
        <path d="M 99 78 C 98 56 106 42 120 41 C 134 42 142 56 141 78 L 141 100 C 141 120 132 130 120 131 C 108 130 99 120 99 100 Z" />

        {/* Beca/tonsure: cabelo em volta das orelhas */}
        <path d="M 96 84 C 88 78 86 66 92 58 C 90 48 100 36 120 35 C 140 36 150 48 148 58 C 154 66 152 78 144 84" strokeWidth="2.6" />
        <path d="M 93 62 C 96 52 104 44 120 43 C 136 44 144 52 147 62" strokeWidth="1.4" opacity="0.8" />
        {/* Cachos laterais */}
        <path d="M 95 80 C 90 84 89 92 93 98 C 95 102 99 104 99 100" strokeWidth="1.6" />
        <path d="M 145 80 C 150 84 151 92 147 98 C 145 102 141 104 141 100" strokeWidth="1.6" />

        {/* Testa — rugas */}
        <path d="M 106 62 C 114 59 126 59 134 62" strokeWidth="1.1" opacity="0.55" />
        <path d="M 107 68 C 114 65 126 65 133 68" strokeWidth="1.1" opacity="0.45" />

        {/* Sobrancelhas */}
        <path d="M 103 78 C 107 74 114 74 118 77" strokeWidth="2" />
        <path d="M 122 77 C 126 74 133 74 137 78" strokeWidth="2" />

        {/* Olhos */}
        <path d="M 104 87 C 107 84 113 84 116 87 C 113 90 107 90 104 87 Z" strokeWidth="1.6" />
        <path d="M 124 87 C 127 84 133 84 136 87 C 133 90 127 90 124 87 Z" strokeWidth="1.6" />
        <circle cx="110" cy="87" r="1.6" fill="currentColor" />
        <circle cx="130" cy="87" r="1.6" fill="currentColor" />

        {/* Nariz */}
        <path d="M 120 88 C 118 96 117 102 116 106" strokeWidth="1.6" />
        <path d="M 112 110 C 116 113 124 113 128 110" strokeWidth="1.6" />

        {/* Bigode e boca */}
        <path d="M 106 118 C 112 114 128 114 134 118" strokeWidth="1.8" />
        <path d="M 108 119 C 106 122 106 125 108 127" strokeWidth="1.4" />
        <path d="M 132 119 C 134 122 134 125 132 127" strokeWidth="1.4" />
        <path d="M 112 124 C 117 127 123 127 128 124" strokeWidth="1.4" opacity="0.7" />

        {/* Sombra no maxilar (hachura de gravura) */}
        <path d="M 103 108 L 100 116 M 106 114 L 103 121 M 137 108 L 140 116 M 134 114 L 137 121" strokeWidth="0.9" opacity="0.5" />

        {/* Manto com gola de pele */}
        <path d="M 120 131 C 118 140 114 146 106 149 L 70 162 C 52 169 42 184 40 204 L 36 260 L 204 260 L 200 204 C 198 184 188 169 170 162 L 134 149 C 126 146 122 140 120 131 Z" strokeWidth="2.6" />

        {/* Gola */}
        <path d="M 106 149 C 108 158 112 164 120 166 C 128 164 132 158 134 149" strokeWidth="2" />
        <path d="M 70 162 C 74 172 82 178 92 180 C 88 170 88 164 90 158" strokeWidth="1.6" opacity="0.8" />
        <path d="M 170 162 C 166 172 158 178 148 180 C 152 170 152 164 150 158" strokeWidth="1.6" opacity="0.8" />

        {/* Vinco central do manto */}
        <path d="M 120 176 L 118 256" strokeWidth="1.2" opacity="0.5" />
        <path d="M 96 176 C 92 204 90 232 90 256" strokeWidth="1" opacity="0.35" />
        <path d="M 144 176 C 148 204 150 232 150 256" strokeWidth="1" opacity="0.35" />

        {/* Mão direita segurando a página */}
        <path d="M 74 216 C 70 208 72 198 80 194 C 86 191 92 192 95 197" strokeWidth="2" />
        <path d="M 80 194 C 82 199 82 205 80 210" strokeWidth="1.4" opacity="0.7" />
        <path d="M 87 194 C 89 199 89 206 87 211" strokeWidth="1.4" opacity="0.7" />
      </g>

      <g
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1200}
        className="animate-draw-in [animation-delay:0.7s]"
      >
        {/* Livro aberto */}
        <path d="M 66 226 L 100 214 L 120 222 L 140 214 L 174 226 L 174 246 L 140 236 L 120 244 L 100 236 L 66 246 Z" strokeWidth="2.2" />
        <path d="M 120 222 L 120 244" strokeWidth="1.4" />

        {/* Diagrama de proporção (Divina proportione) na página esquerda */}
        <circle cx="84" cy="232" r="6" strokeWidth="1.2" opacity="0.85" />
        <path d="M 78 240 L 90 240 L 84 228 Z" strokeWidth="1" opacity="0.7" />

        {/* Linhas de texto na página direita */}
        <path d="M 128 224 L 152 230 M 128 230 L 152 236 M 128 236 L 152 242" strokeWidth="1" opacity="0.7" />
      </g>
    </svg>
  );
}
