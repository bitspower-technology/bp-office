import { useId, type ReactNode } from 'react'

export interface IconProps {
  size?: number
}

function Svg({ size = 16, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      aria-hidden
    >
      {children}
    </svg>
  )
}

export function IconSend(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.2 8 13.8 2.6 11 13.4 7.6 9.6z" strokeLinejoin="round" />
      <path d="M7.6 9.6 13.8 2.6" />
    </Svg>
  )
}

export function IconStop(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="4" width="8" height="8" rx="1.5" fill="currentColor" stroke="none" />
    </Svg>
  )
}

/** return/enter arrow (↵) for the icon-only send button */
export function IconEnter(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M13 3.5v4a2.5 2.5 0 0 1-2.5 2.5H3.5" />
      <path d="M6.5 7 3.5 10l3 3" />
    </Svg>
  )
}

/**
 * Canonical NiuOffice gradient-outline mark. The geometry and three-stop
 * gradient come from branding/niuoffice-gradient-outline.svg.
 */
export function NiuOfficeMark({ size = 18 }: IconProps) {
  const instance = useId().replace(/:/g, '')
  const lowerPath = `niu-lower-${instance}`
  const upperPath = `niu-upper-${instance}`
  const lowerGradient = `niu-lower-gradient-${instance}`
  const upperGradient = `niu-upper-gradient-${instance}`
  const lowerClip = `niu-lower-clip-${instance}`
  const upperClip = `niu-upper-clip-${instance}`

  return (
    <svg
      width={size}
      height={size}
      viewBox="33 31 80 80"
      fill="none"
      role="img"
      aria-label="NiuOffice"
    >
      <defs>
        <path
          id={lowerPath}
          transform="translate(83.6899 72.9248)"
          d="M0 0H-9.628V-9.627H-24.628C-26.967-9.627-28.88-7.714-28.88-5.375V14.441H-38.507V-5.081C-38.507-12.876-32.129-19.254-24.334-19.254H-9.628V-19.255H0V-19.254H.001V-9.627H0Z"
        />
        <path
          id={upperPath}
          transform="translate(83.8511 87.3652)"
          d="M0 0H-14.707V.001H-24.334V0H-24.335V-9.627H-24.334V-19.254H-14.707V-9.627H.294C2.632-9.627 4.546-11.54 4.546-13.879V-33.695H14.173V-14.173C14.173-6.378 7.795 0 0 0Z"
        />
        <linearGradient
          id={lowerGradient}
          gradientUnits="userSpaceOnUse"
          x1="-39.6899"
          y1="-18.9248"
          x2="16.3101"
          y2="15.0752"
        >
          <stop offset="0" stopColor="#20DAE6" />
          <stop offset=".5" stopColor="#8081E5" />
          <stop offset="1" stopColor="#DE2287" />
        </linearGradient>
        <linearGradient
          id={upperGradient}
          gradientUnits="userSpaceOnUse"
          x1="-39.8511"
          y1="-33.3652"
          x2="16.1489"
          y2=".6348"
        >
          <stop offset="0" stopColor="#20DAE6" />
          <stop offset=".5" stopColor="#8081E5" />
          <stop offset="1" stopColor="#DE2287" />
        </linearGradient>
        <clipPath id={lowerClip}>
          <use href={`#${lowerPath}`} />
        </clipPath>
        <clipPath id={upperClip}>
          <use href={`#${upperPath}`} />
        </clipPath>
      </defs>
      <g transform="translate(0 141.732) scale(1 -1)">
        <g clipPath={`url(#${lowerClip})`}>
          <use
            href={`#${lowerPath}`}
            fill="none"
            stroke={`url(#${lowerGradient})`}
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        </g>
        <g clipPath={`url(#${upperClip})`}>
          <use
            href={`#${upperPath}`}
            fill="none"
            stroke={`url(#${upperGradient})`}
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        </g>
      </g>
    </svg>
  )
}
