const uploader = {
  on: () => {},
  off: () => {},
  destroy: () => {},
  addFile: () => {
    throw new Error('Upload desativado na revisão visual isolada.');
  },
};
export const useUppyUploader = () => uploader;
export const showMediaBox = () =>
  window.alert('Biblioteca desativada somente nesta revisão visual isolada.');
