import { FilmCompositions } from "./film/ListikFilm";
import { LogoStingCompositions } from "./LogoSting";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <LogoStingCompositions />
      <FilmCompositions />
    </>
  );
};
