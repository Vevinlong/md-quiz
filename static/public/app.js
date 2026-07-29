import { createPublicApiModule } from "./modules/api.js";
import { createPublicCodeEditorModule } from "./modules/pages/code-editor.js";
import { createPublicFullQuizModule } from "./modules/pages/full-quiz.js";
import { createPublicQuizModule } from "./modules/quiz.js";
import { createPublicResumeModule } from "./modules/resume.js";
import { createPublicRouterModule } from "./modules/router.js";
import { createPublicState } from "./modules/state.js";
import { createPublicVerifyModule } from "./modules/verify.js";
import { createPublicViewLoaderModule } from "./modules/view-loader.js";

const register = () => {
  if (!window.Alpine) return;
  window.Alpine.data("publicApp", () => ({
    ...createPublicState(),
    ...createPublicApiModule(),
    ...createPublicCodeEditorModule(),
    ...createPublicViewLoaderModule(),
    ...createPublicRouterModule(),
    ...createPublicVerifyModule(),
    ...createPublicResumeModule(),
    ...createPublicQuizModule(),
    ...createPublicFullQuizModule(),
  }));
};

if (window.Alpine) {
  register();
} else {
  document.addEventListener("alpine:init", register, { once: true });
}
