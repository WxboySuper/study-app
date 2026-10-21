// The static assets of the app.
//
// Metro turns an import of an asset into a `require` of that asset, so the
// imported value is the asset id. The type is `number` for images and sounds.

declare module '*.mp3' {
  const asset: number;
  export default asset;
}

declare module '*.ogg' {
  const asset: number;
  export default asset;
}

declare module '*.png' {
  const asset: number;
  export default asset;
}

declare module '*.jpg' {
  const asset: number;
  export default asset;
}
