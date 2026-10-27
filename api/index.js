// M01's deployment keeps the original handler on its frozen milestone branch.
export default async function api(req, res) {
  const { default: handler } = await import(process.env.PPCP_MILESTONE === 'M04' ? './m04.js' : process.env.M03_CHECKPOINT ? './m03.js' : './m02.js');
  return handler(req, res);
}
