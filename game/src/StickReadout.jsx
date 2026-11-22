export function StickReadout({pitch,roll,pointer,ground}) {
  const axes=[
    {key:'pitch',label:'俯仰',value:pitch,positive:'抬头',negative:'低头'},
    {key:'roll',label:'左右',value:roll,positive:'右',negative:'左'},
  ];
  return <section className="stick-readout" aria-label="操纵杆开度">
    <span className="stick-title">{ground?'前轮转向':'操纵杆'}<br/><small>开度</small></span>
    <div className="stick-pad" {...pointer} tabIndex={0} role="group" aria-label="二维侧杆，前推压机头，后拉抬机头，松手自动回中" title="向前拖动压机头 · 向后拖动抬机头 · 松手回中">
      <span className="stick-pad-horizontal"/><span className="stick-pad-vertical"/>
      <span className="stick-pad-position" style={{left:`${50+roll*42}%`,top:`${50+pitch*42}%`}}/>
    </div>
    {axes.map(axis=>{
      const percent=Math.round(axis.value*100);
      return <div className="stick-axis" key={axis.key}>
        <div className="stick-axis-label"><span>{axis.label}<small>{percent===0?'中立':percent>0?axis.positive:axis.negative}</small></span><output data-stick-axis={axis.key} aria-label={`${axis.label}开度`}>{percent>0?'+':''}{percent}%</output></div>
      </div>;
    })}
  </section>;
}
