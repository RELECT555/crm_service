// Stroke icons (24px grid, currentColor). Kept local to avoid an icon dependency.
const paths = {
  workspaces: 'M3 7.5 12 3l9 4.5-9 4.5-9-4.5Zm0 4.5 9 4.5 9-4.5M3 16.5 12 21l9-4.5',
  plug: 'M9 7V3m6 4V3M7 7h10v4a5 5 0 0 1-10 0V7Zm5 9v5',
  logout: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10',
  plus: 'M12 5v14M5 12h14',
  refresh: 'M20 11a8 8 0 0 0-14.5-4.5L4 8m0-4v4h4m-4 5a8 8 0 0 0 14.5 4.5L20 16m0 4v-4h-4',
  close: 'M6 6l12 12M18 6 6 18',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  external: 'M14 4h6v6m0-6-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  trash: 'M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3',
  check: 'M5 12.5 10 17l9-10',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  edit: 'M4 20h4L19 9l-4-4L4 16v4Z',
} as const

export function Icon({ name }: { name: keyof typeof paths }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  )
}

export function BrandMark() {
  return (
    <svg viewBox="0 0 32 32" width="20" height="20" aria-hidden="true">
      <path d="M6 22h4v-7H6zm7.5 0h4V10h-4zm7.5 0h4V13h-4z" fill="#fff" />
      <path d="M6 26h20" stroke="#60A5FA" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
