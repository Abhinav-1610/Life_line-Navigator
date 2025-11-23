const CITIES=[
  {name:"Bengaluru",lat:12.9716,lng:77.5946,zoom:13},
  {name:"Mumbai",lat:19.0760,lng:72.8777,zoom:12},
  {name:"Delhi",lat:28.6139,lng:77.2090,zoom:12},
  {name:"Chennai",lat:13.0827,lng:80.2707,zoom:12},
  {name:"Kolkata",lat:22.5726,lng:88.3639,zoom:12}
];
const HOSPITALS={
  0:[
    {name:"Manipal Hospital, HAL Airport Road",lat:12.9563,lng:77.6396},
    {name:"Apollo Hospital, Bannerghatta Road",lat:12.8988,lng:77.6008},
    {name:"Fortis Hospital, Cunningham Road",lat:12.9926,lng:77.5957},
    {name:"Columbia Asia Hospital, Whitefield",lat:12.9698,lng:77.7499},
    {name:"Narayana Health City, Bommasandra",lat:12.8453,lng:77.6811}
  ],
  1:[
    {name:"Lilavati Hospital",lat:19.0522,lng:72.8303},
    {name:"Breach Candy Hospital",lat:18.9716,lng:72.8053},
    {name:"Kokilaben Dhirubhai Ambani Hospital",lat:19.1334,lng:72.8266}
  ],
  2:[
    {name:"AIIMS Delhi",lat:28.5672,lng:77.2100},
    {name:"Max Super Speciality Hospital",lat:28.5494,lng:77.2694},
    {name:"Fortis Escorts Heart Institute",lat:28.5733,lng:77.2802}
  ],
  3:[
    {name:"Apollo Hospital, Greams Road",lat:13.0569,lng:80.2425},
    {name:"Fortis Malar Hospital",lat:13.0381,lng:80.2442},
    {name:"MIOT International",lat:13.0080,lng:80.2093}
  ],
  4:[
    {name:"Apollo Gleneagles Hospital",lat:22.5414,lng:88.3439},
    {name:"AMRI Hospital",lat:22.5333,lng:88.3629},
    {name:"Medica Superspecialty Hospital",lat:22.5177,lng:88.3685}
  ]
};
let map,ambulanceMarker,hospitalMarker,routePolyline,ambulanceLocation,hospitalLocation,isNavigating,navigationInterval,isPaused=false;
let currentRouteIndex=0,routeCoordinates=[],trafficSignals=[],signalMarkers=[],congestionZones=[],currentSpeed=0,rerouteCount=0,congestionFrameCounter=0,congestionCircles=[];

function initMap(){
  map=L.map("map").setView([CITIES[0].lat,CITIES[0].lng],CITIES[0].zoom);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
    attribution:"© OpenStreetMap contributors",
    maxZoom:19
  }).addTo(map);
  map.on("click",e=>{if(!isNavigating) setAmbulanceLocation(e.latlng)});
}

function setAmbulanceLocation(latlng){
  ambulanceLocation=latlng;
  if(ambulanceMarker) map.removeLayer(ambulanceMarker);
  const ambulanceIcon=L.divIcon({
    html:'<div class="ambulance-marker">🚑</div>',
    className:"",
    iconSize:[50,50],
    iconAnchor:[25,25]
  });
  ambulanceMarker=L.marker(latlng,{icon:ambulanceIcon}).addTo(map);
  document.getElementById("startBtn").disabled=!hospitalLocation;
  updateInstruction("Ambulance location set! Select hospital and start navigation.");
}

function updateHospitals(){
  const cityIndex=document.getElementById("citySelect").value;
  const hospitalSelect=document.getElementById("hospitalSelect");
  hospitalSelect.innerHTML="";
  HOSPITALS[cityIndex].forEach((h,i)=>{
    const o=document.createElement("option");
    o.value=i;
    o.textContent=h.name;
    hospitalSelect.appendChild(o);
  });
  updateHospitalMarker();
}

function updateHospitalMarker(){
  const cityIndex=document.getElementById("citySelect").value;
  const hospitalIndex=document.getElementById("hospitalSelect").value;
  const hospital=HOSPITALS[cityIndex][hospitalIndex];
  hospitalLocation=L.latLng(hospital.lat,hospital.lng);
  if(hospitalMarker) map.removeLayer(hospitalMarker);
  const hospitalIcon=L.divIcon({
    html:'<div style="font-size:32px;">🏥</div>',
    className:"",
    iconSize:[32,32],
    iconAnchor:[16,16]
  });
  hospitalMarker=L.marker(hospitalLocation,{icon:hospitalIcon}).addTo(map);
  document.getElementById("startBtn").disabled=!ambulanceLocation;
}

async function calculateRoute(){
  if(!ambulanceLocation||!hospitalLocation) return;
  const start=`${ambulanceLocation.lng},${ambulanceLocation.lat}`;
  const end=`${hospitalLocation.lng},${hospitalLocation.lat}`;
  try{
    const res=await fetch(`https://router.project-osrm.org/route/v1/driving/${start};${end}?overview=full&geometries=geojson&steps=true`);
    const data=await res.json();
    if(data.routes&&data.routes.length>0){
      const route=data.routes[0];
      routeCoordinates=route.geometry.coordinates.map(c=>L.latLng(c[1],c[0]));
      if(routePolyline) map.removeLayer(routePolyline);
      routePolyline=L.polyline(routeCoordinates,{color:"#C0152F",weight:5,opacity:.7}).addTo(map);
      map.fitBounds(routePolyline.getBounds(),{padding:[50,50]});
      const distance=(route.distance/1000).toFixed(1);
      const duration=Math.ceil(route.duration/60);
      document.getElementById("routeDistance").textContent=`${distance} km`;
      document.getElementById("routeETA").textContent=`ETA: ${duration} min`;
      window.currentRouteDistance=distance;
      generateTrafficSignals();
      generateCongestionZones();
      return true;
    }
  }catch(e){
    console.error("Route calculation error:",e);
    return false;
  }
}

function generateTrafficSignals(){
  signalMarkers.forEach(m=>map.removeLayer(m));
  signalMarkers=[];
  trafficSignals=[];
  const routeDistance=window.currentRouteDistance||5;
  const baseSignals=5;
  const additionalSignals=Math.floor(routeDistance/5)*2;
  const totalSignals=Math.min(baseSignals+additionalSignals,20);
  const positions=[];
  for(let i=1;i<=totalSignals;i++) positions.push(i/(totalSignals+1));
  positions.forEach((p,i)=>{
    const coordIndex=Math.floor(routeCoordinates.length*p);
    const coord=routeCoordinates[coordIndex];
    const states=["red","yellow","green"];
    const initialState=states[Math.floor(Math.random()*states.length)];
    const signal={id:i,position:coord,state:initialState,originalState:initialState,mode:"normal",coordIndex};
    trafficSignals.push(signal);
    renderSignal(signal);
  });
  document.getElementById("signalCount").textContent=trafficSignals.length;
}

function renderSignal(signal){
  const modeClass=signal.mode==="override"?"override":
                  signal.mode==="extended"?"extended":
                  signal.mode==="clearing"?"clearing":"";
  const modeLabel=signal.mode==="override"?"OVERRIDE":
                  signal.mode==="extended"?"EXTENDED":
                  signal.mode==="clearing"?"TRAFFIC CLEARING":"";
  const labelHtml=modeLabel?`<div class="signal-label ${modeClass}">${modeLabel}</div>`:"";
  const popupHtml=signal.mode==="extended"
    ?'<div class="signal-popup">🚑 Ambulance Detected - Green Light</div>'
    :"";
  const icon=L.divIcon({
    html:`<div class="traffic-light ${signal.state} ${modeClass}">${signal.state==="red"?"🔴":signal.state==="yellow"?"🟡":"🟢"}${labelHtml}${popupHtml}</div>`,
    className:"",
    iconSize:[40,40],
    iconAnchor:[20,20]
  });
  const marker=L.marker(signal.position,{icon}).addTo(map);
  signalMarkers.push(marker);
}

function generateCongestionZones(){
  congestionZones=[];
  for(let i=0;i<2;i++){
    const pos=.3+i*.35;
    const coordIndex=Math.floor(routeCoordinates.length*pos);
    const center=routeCoordinates[coordIndex];
    congestionZones.push({
      center,
      radius:200,
      severity:.6+Math.random()*.3,
      coordIndex
    });
  }
}

function updateSignalLogic(signal,distanceToSignal){
  const approachThreshold=300;
  const heavyCongestionThreshold=150;
  let nearCongestion=false;
  congestionZones.forEach(z=>{
    const d=ambulanceLocation.distanceTo(z.center);
    if(d<heavyCongestionThreshold) nearCongestion=true;
  });
  if(distanceToSignal<approachThreshold){
    if(signal.state==="red"){
      signal.state="green";
      signal.mode="override";
      updateSignalMode("Active");
    }else if(signal.state==="yellow"){
      signal.state="green";
      signal.mode="override";
      updateSignalMode("Active");
    }else if(signal.state==="green"){
      signal.mode="extended";
      updateSignalMode("Active");
    }
    if(nearCongestion){
      signal.mode="clearing";
      signal.state="green";
      updateSignalMode("Clearing");
      showClearingAlert();
    }
  }else{
    if(signal.mode!=="normal"){
      signal.state=signal.originalState;
      signal.mode="normal";
    }
  }
}

function showClearingAlert(){
  const banner=document.getElementById("alertBanner");
  banner.classList.add("active");
  setTimeout(()=>banner.classList.remove("active"),3000);
}

function updateSignalMode(mode){
  const indicator=document.getElementById("signalMode");
  indicator.className="mode-indicator";
  if(mode==="Clearing"){
    indicator.classList.add("mode-clearing");
    indicator.textContent="Clearing";
  }else if(mode==="Active"){
    indicator.classList.add("mode-active");
    indicator.textContent="Active";
  }else{
    indicator.classList.add("mode-standby");
    indicator.textContent="Standby";
  }
}

async function startNavigation(){
  if(isNavigating) return;
  updateInstruction("Calculating optimal route...");
  const ok=await calculateRoute();
  if(!ok){
    updateInstruction("Route calculation failed. Please try again.");
    return;
  }
  map.setView(ambulanceLocation,16,{animate:true,duration:1});
  isNavigating=true;
  isPaused=false;
  currentRouteIndex=0;
  document.getElementById("startBtn").disabled=true;
  document.getElementById("pauseBtn").disabled=false;
  document.getElementById("stopBtn").disabled=false;
  document.getElementById("navStatus").textContent="Navigating";
  updateSignalMode("Active");
  updateInstruction("Emergency navigation active! Optimizing traffic signals...");
  navigationInterval=setInterval(updateNavigation,200);
}

function togglePause(){
  isPaused=!isPaused;
  const pauseBtn=document.getElementById("pauseBtn");
  if(isPaused){
    pauseBtn.textContent="▶️ Resume";
    document.getElementById("navStatus").textContent="Paused";
    updateInstruction("Navigation paused. Click Resume to continue.");
  }else{
    pauseBtn.textContent="⏸️ Pause";
    document.getElementById("navStatus").textContent="Navigating";
    updateInstruction("Emergency navigation active! Optimizing traffic signals...");
  }
}

function stopNavigationManual(){
  stopNavigation();
  currentRouteIndex=0;
  currentSpeed=0;
  document.getElementById("speedDisplay").textContent="0 km/h";
  document.getElementById("startBtn").disabled=false;
  document.getElementById("pauseBtn").disabled=true;
  document.getElementById("pauseBtn").textContent="⏸️ Pause";
  document.getElementById("stopBtn").disabled=true;
  isPaused=false;
  trafficSignals.forEach((s,i)=>{
    s.state=s.originalState;
    s.mode="normal";
    if(signalMarkers[i]) map.removeLayer(signalMarkers[i]);
    renderSignal(s);
  });
  congestionCircles.forEach(c=>map.removeLayer(c));
  congestionCircles=[];
  updateSignalMode("Standby");
  document.getElementById("navStatus").textContent="Ready";
  updateInstruction("Navigation stopped. Configure settings to start again.");
}

function updateNavigation(){
  if(isPaused) return;
  if(currentRouteIndex>=routeCoordinates.length-1){
    stopNavigation();
    document.getElementById("startBtn").disabled=false;
    document.getElementById("pauseBtn").disabled=true;
    document.getElementById("stopBtn").disabled=true;
    updateInstruction("🎉 Arrived at hospital! Mission complete.");
    return;
  }
  currentRouteIndex+=1;
  ambulanceLocation=routeCoordinates[currentRouteIndex];
  if(ambulanceMarker) ambulanceMarker.setLatLng(ambulanceLocation);
  map.setView(ambulanceLocation,16,{animate:true,duration:.3,easeLinearity:.5});
  currentSpeed=40+Math.random()*30;
  document.getElementById("speedDisplay").textContent=`${Math.round(currentSpeed)} km/h`;
  trafficSignals.forEach((s,i)=>{
    const d=ambulanceLocation.distanceTo(s.position);
    if(d<500){
      const prev=s.mode;
      updateSignalLogic(s,d);
      if(s.mode!==prev){
        if(signalMarkers[i]) map.removeLayer(signalMarkers[i]);
        renderSignal(s);
      }
    }
  });
  const progress=currentRouteIndex/routeCoordinates.length*100;
  const efficiency=Math.round(85+progress*.15);
  document.getElementById("efficiency").textContent=`${efficiency}%`;
  renderCongestionZones();
}

function renderCongestionZones(){
  if(++congestionFrameCounter%20!==0) return;
  congestionCircles.forEach(c=>map.removeLayer(c));
  congestionCircles=[];
  congestionZones.forEach(z=>{
    if(ambulanceLocation.distanceTo(z.center)<500){
      congestionCircles.push(
        L.circle(z.center,{
          radius:z.radius,
          color:"#E68161",
          fillColor:"#E68161",
          fillOpacity:.3,
          weight:2
        }).addTo(map)
      );
    }
  });
}

function stopNavigation(){
  isNavigating=false;
  if(navigationInterval){
    clearInterval(navigationInterval);
    navigationInterval=null;
  }
  document.getElementById("navStatus").textContent="Complete";
  updateSignalMode("Standby");
}

function updateInstruction(text){
  document.getElementById("instructionText").textContent=text;
}

document.getElementById("citySelect").addEventListener("change",function(){
  const cityIndex=this.value;
  map.setView([CITIES[cityIndex].lat,CITIES[cityIndex].lng],CITIES[cityIndex].zoom);
  updateHospitals();
});
document.getElementById("hospitalSelect").addEventListener("change",updateHospitalMarker);
document.getElementById("startBtn").addEventListener("click",startNavigation);
document.getElementById("pauseBtn").addEventListener("click",togglePause);
document.getElementById("stopBtn").addEventListener("click",stopNavigationManual);

initMap();
updateHospitals();
