import {FCU as A320FCU,AircraftControls as A320Controls} from '../CockpitPanels.jsx';
import {Instruments as A320Instruments} from '../Instruments.jsx';
import {aircraftDefinition} from './registry.js';
import {AIRCRAFT_ADAPTERS} from './adapter-ids.js';

// Shared simplified panel geometry; each definition selects its own gauge count,
// dimensions, rates and speeds. This is not a full manufacturer flight deck.
const sharedPanel=Object.freeze({FCU:A320FCU,Controls:A320Controls,Instruments:A320Instruments});
const cockpits=Object.freeze({[AIRCRAFT_ADAPTERS.cockpit.a320]:sharedPanel,[AIRCRAFT_ADAPTERS.cockpit.a380]:sharedPanel});
function adapter(state){const id=aircraftDefinition(state).cockpit.adapter,value=cockpits[id];if(!value)throw new Error('Cockpit renderer is not installed: '+id);return value;}
export function FCU(props){const View=adapter(props.state).FCU;return <View {...props}/>;}
export function AircraftControls(props){const View=adapter(props.state).Controls;return <View {...props}/>;}
export function Instruments(props){const View=adapter(props.state).Instruments;return <View {...props}/>;}
