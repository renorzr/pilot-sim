// Game buttons must not retain keyboard focus after pointer interaction.
// Keep existing click, hold and pointer-capture handlers unchanged.
export function buttonInteractionProps(type,props){
 // Map/menu controls explicitly retain focus for dropdown and keyboard access.
 if(props?.['data-menu-focus'])return props;
 if(typeof type!=='string'||(type!=='button'&&props?.role!=='button'))return props;
 return{...props,tabIndex:-1,
  onMouseDown(event){event.preventDefault();props?.onMouseDown?.(event);},
  onFocus(event){event.currentTarget.blur();props?.onFocus?.(event);},
 };
}
