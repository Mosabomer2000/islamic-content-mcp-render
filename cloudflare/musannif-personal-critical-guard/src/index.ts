import handler from "./handler";

export default {
  fetch(request: Request): Promise<Response> {
    return handler(request);
  },
};
