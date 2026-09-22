
export interface AuthStrategy {
  /** Descriptive name of the authentication provider strategy */
  readonly name: string

  /** Check if a network request URL belongs to this provider */
  matches(url: string): boolean

  /** Optionally rewrite outgoing HTTP request headers for this provider */
  modifyHeaders?(headers: Record<string, string>, url: string): Record<string, string>

  /** Check if a popup/window.open URL is allowed for this provider */
  isAllowedPopupUrl?(url: string): boolean
}

export interface PopupBounds {
  width: number
  height: number
  x: number
  y: number
}
