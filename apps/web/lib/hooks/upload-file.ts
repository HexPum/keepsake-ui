import { useMutation } from "@tanstack/react-query";

import {
  ZUploadError,
  zUploadErrorSchema,
  ZUploadResponse,
  zUploadResponseSchema,
} from "@karakeep/shared/types/uploads";

export default function useUpload({
  onSuccess,
  onError,
}: {
  onError?: (e: ZUploadError, req: File) => void;
  onSuccess?: (resp: ZUploadResponse, req: File) => Promise<void>;
}) {
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const resp = await fetch("/api/assets", {
        method: "POST",
        body: formData,
      });
      if (!resp.ok) {
        throw new Error(await resp.text());
      }
      return zUploadResponseSchema.parse(await resp.json());
    },
    onSuccess: onSuccess,
    onError: (error, req) => {
      if (!onError) {
        return;
      }
      // The route answers failures with a {error} JSON envelope, but a
      // network failure ("Failed to fetch"), a proxy error or an HTML error
      // page arrives as arbitrary text. Parsing it unconditionally threw
      // *inside* this handler, so the caller's onError never ran and the UI
      // was left with no message at all.
      let err: ZUploadError;
      try {
        err = zUploadErrorSchema.parse(JSON.parse(error.message));
      } catch {
        err = { error: error.message || "Upload failed" };
      }
      onError(err, req);
    },
  });
}
