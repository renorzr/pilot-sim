import {jsx as reactJSX,jsxs as reactJSXs,Fragment} from 'react/jsx-runtime';
import {localizeProps} from './index.js';
import {buttonInteractionProps} from '../button-interactions.js';
export {Fragment};
export const jsx=(type,props,key)=>reactJSX(type,localizeProps(buttonInteractionProps(type,props)),key);
export const jsxs=(type,props,key)=>reactJSXs(type,localizeProps(buttonInteractionProps(type,props)),key);
