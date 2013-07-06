// MidiEvents : Read (and soon edit) events from various sources (ArrayBuffer, Stream)

// AMD + global : You can use this object by inserting a script
// or using an AMD loader (like RequireJS)
(function(root,define){ define([], function() {

	function MidiEvents() {
		throw new Error('MidiEvents function not intended to be run.');
	}

	// Static constants
	// Event types
	MidiEvents.EVENT_META=0xFF;
	MidiEvents.EVENT_SYSEX=0xF0;
	MidiEvents.EVENT_DIVSYSEX=0xF7;
	MidiEvents.EVENT_MIDI=0x8;
	// Meta event types
	MidiEvents.EVENT_META_SEQUENCE_NUMBER=0x00,
	MidiEvents.EVENT_META_TEXT=0x01,
	MidiEvents.EVENT_META_COPYRIGHT_NOTICE=0x02,
	MidiEvents.EVENT_META_TRACK_NAME=0x03,
	MidiEvents.EVENT_META_INSTRUMENT_NAME=0x04,
	MidiEvents.EVENT_META_LYRICS=0x05,
	MidiEvents.EVENT_META_MARKER=0x06,
	MidiEvents.EVENT_META_CUE_POINT=0x07,
	MidiEvents.EVENT_META_MIDI_CHANNEL_PREFIX=0x20,
	MidiEvents.EVENT_META_END_OF_TRACK=0x2F,
	MidiEvents.EVENT_META_SET_TEMPO=0x51,
	MidiEvents.EVENT_META_SMTPE_OFFSET=0x54,
	MidiEvents.EVENT_META_TIME_SIGNATURE=0x58,
	MidiEvents.EVENT_META_KEY_SIGNATURE=0x59,
	MidiEvents.EVENT_META_SEQUENCER_SPECIFIC=0x7F;
	// Midi event types
	MidiEvents.EVENT_MIDI_NOTE_OFF=0x8,
	MidiEvents.EVENT_MIDI_NOTE_ON=0x9,
	MidiEvents.EVENT_MIDI_NOTE_AFTERTOUCH=0xA,
	MidiEvents.EVENT_MIDI_CONTROLLER=0xB,
	MidiEvents.EVENT_MIDI_PROGRAM_CHANGE=0xC,
	MidiEvents.EVENT_MIDI_CHANNEL_AFTERTOUCH=0xD,
	MidiEvents.EVENT_MIDI_PITCH_BEND=0xE;

	// Create a event stream parser
	MidiEvents.createParser=function(stream, startAt, strictMode){
		// Wrap DataView into a data stream
		if(stream instanceof DataView) {
			stream={
				'position':startAt||0,
				'buffer':stream,
				'readUint8':function(){
					return this.buffer.getUint8(this.position++);
				},
				'readUint16':function(){
					var v=this.buffer.getUint16(this.position);
					this.position=this.position+2;
					return v;
				},
				'readUint32':function(){
					var v=this.buffer.getUint16(this.position);
					this.position=this.position+2;
					return v;
				},
				'readVarInt':function(){
					var v=0, i=0;
					while(i++<4) {
						var b=this.readUint8();
						if (b&0x80) {
							v+=(b&0x7f);
							v<<=7;
						} else {
							return v+b;
						}
					}
					throw new Error('0x'+this.position.toString(16)+': Variable integer'
						+' length cannot exceed 4 bytes');
				},
				'readText':function(l){
					var chars=[];
					for(l; l>0; l--) {
						chars.push(String.fromCharCode(this.readUint8()));
					}
					return chars.join('');
				},
				'readBytes':function(l){
					var bytes=[];
					for(l; l>0; l--) {
						bytes.push(this.readUint8());
					}
					return bytes;
				},
				'pos':function(l){
					return '0x'+this.position.toString(16);
				},
				'end':function(l){
					return this.position===this.buffer.byteLength;
				}
			}
		// Consume stream till not at start index
		} else {
			while(startAt--)
				stream.readUint8();
		}
		// Private vars
		// Common vars
		var deltaTime, eventTypeByte, lastEventTypeByte, event,
		// system events vars
			sysEventLength,
		// meta events vars
			metaEventType, metaEventLength,
		// midi events vars
			midiEventType, midiEventChannel, midiEventParam1, midiEventParam2;
		// creating the parser object
		return {
			// Read the next event
			'next':function() {
				// Check available datas
				if(stream.end())
					return null;
				// Read the delta time
				deltaTime=stream.readVarInt();
				// Read the eventTypeByte
				eventTypeByte=stream.readUint8();
				if((eventTypeByte&0xF0) == 0xF0) {
					// Meta events
					if(eventTypeByte==MidiEvents.EVENT_META) {
						metaEventType=stream.readUint8();
						metaEventLength=stream.readVarInt();
						event={
									'type':MidiEvents.EVENT_META,
									'subtype':metaEventType,
									'length':metaEventLength,
								};
						switch(metaEventType) {
							case MidiEvents.EVENT_META_SEQUENCE_NUMBER:
								if(strictMode&&2!==metaEventLength)
									throw new Error(stream.pos()+' Bad metaevent length.');
								event.msb=stream.readUint8();
								event.lsb=stream.readUint8();
								return event;
								break;
							case MidiEvents.EVENT_META_TEXT:
							case MidiEvents.EVENT_META_COPYRIGHT_NOTICE:
							case MidiEvents.EVENT_META_TRACK_NAME:
							case MidiEvents.EVENT_META_INSTRUMENT_NAME:
							case MidiEvents.EVENT_META_LYRICS:
							case MidiEvents.EVENT_META_MARKER:
							case MidiEvents.EVENT_META_CUE_POINT:
								event.text=stream.readText(metaEventLength);
								return event;
								break;
							case MidiEvents.EVENT_META_MIDI_CHANNEL_PREFIX:
								if(strictMode&&1!==metaEventLength)
									throw new Error(stream.pos()+' Bad metaevent length.');
								event.prefix=stream.readUint8();
								return event;
								break;
							case MidiEvents.EVENT_META_END_OF_TRACK:
								if(strictMode&&0!==metaEventLength)
									throw new Error(stream.pos()+' Bad metaevent length.');
								return event;
								break;
							case MidiEvents.EVENT_META_SET_TEMPO:
								if(strictMode&&3!==metaEventLength)
									throw new Error(stream.pos()+' Bad metaevent length.');
								event.v1=stream.readUint8();
								event.v2=stream.readUint8();
								event.v3=stream.readUint8();
								event.tempoMPQN=((event.v1 << 16)
									+ (event.v2 << 8)
									+ event.v3);
								event.tempo=1000/((60000000/event.tempoMPQN)/60);
								event.tempoBPM=1000/event.tempo*60;
								return event;
								break;
							case MidiEvents.EVENT_META_SMTPE_OFFSET:
								if(strictMode&&5!==metaEventLength)
									throw new Error(stream.pos()+' Bad metaevent length.');
								event.hour=stream.readUint8();
								if(strictMode&&event.hour>23)
									throw new Error(stream.pos()+' Value must be part of 0-23.');
								event.minutes=stream.readUint8();
								if(strictMode&&event.minutes>59)
									throw new Error(stream.pos()+' Value must be part of 0-59.');
								event.seconds=stream.readUint8();
								if(strictMode&&event.seconds>59)
									throw new Error(stream.pos()+' Value must be part of 0-59.');
								event.frames=stream.readUint8();
								if(strictMode&&event.frames>30)
									throw new Error(stream.pos()+' Value must be part of 0-30.');
								event.subframes=stream.readUint8();
								if(strictMode&&event.subframes>99)
									throw new Error(stream.pos()+' Value must be part of 0-99.');
								return event;
								break;
							 // Not implemented
							case MidiEvents.EVENT_META_TIME_SIGNATURE:
								if(strictMode&&4!==metaEventLength)
									throw new Error(stream.pos()+' Bad metaevent length.');
								while(metaEventLength--) { stream.readUint8(); }
								return event;
								break;
							case MidiEvents.EVENT_META_KEY_SIGNATURE:
								if(strictMode&&2!==metaEventLength)
									throw new Error(stream.pos()+' Bad metaevent length.');
								while(metaEventLength--) { stream.readUint8(); }
								return event;
								break;
							case MidiEvents.EVENT_META_SEQUENCER_SPECIFIC:
								event.data=stream.readBytes(metaEventLength);
								return event;
								break;
							default:
								if(strictMode)
									throw new Error(stream.pos()+' Unknown meta event type '
										+'('+metaEventType.toString(16)+').');
								event.data=stream.readBytes(event.length);
								return event;
								break;
						}
					// System events
					} else if(eventTypeByte==MidiEvents.EVENT_SYSEX
							||eventTypeByte==MidiEvents.EVENT_DIVSYSEX) {
						event={
									'type':eventTypeByte,
									'length':stream.readVarInt(),
								};
						event.data=stream.readBytes(event.length);
						return event;
					// Unknown event, assuming it's system like event
					} else {
						if(strictMode)
							throw new Error(stream.pos()+' Unknown event type '
								+eventTypeByte.toString(16)+', Delta: '+deltaTime+'.');
						event={
									'type':eventTypeByte,
									'badsubtype':stream.readVarInt(),
									'length':stream.readUint8()
								};
						event.data=stream.readBytes(event.length);
						return event;
					}
				// Midi events
				} else {
						// running status
						if((eventTypeByte&0x80)==0){
							if(!(midiEventType))
								throw new Error(stream.pos()+' Running status without previous event');
							midiEventParam1=eventTypeByte;
						} else {
							midiEventType=eventTypeByte>>4;
							midiEventChannel=eventTypeByte&0x0F;
							midiEventParam1=stream.readUint8();
						}
						event={
									'type':MidiEvents.EVENT_MIDI,
									'subtype':midiEventType,
									'delta':deltaTime,
									'channel':midiEventChannel,
									'param1':midiEventParam1
								};
						switch(midiEventType) {
							case MidiEvents.EVENT_MIDI_NOTE_OFF:
								event.param2=stream.readUint8();
								return event;
								break;
							case MidiEvents.EVENT_MIDI_NOTE_ON:
								// Could check velocity 0 to switch to off but loosing informations
								event.param2=stream.readUint8();
								return event;
								break;
							case MidiEvents.EVENT_MIDI_NOTE_AFTERTOUCH:
								event.param2=stream.readUint8();
								return event;
								break;
							case MidiEvents.EVENT_MIDI_CONTROLLER:
								event.param2=stream.readUint8();
								return event;
								break;
							case MidiEvents.EVENT_MIDI_PROGRAM_CHANGE:
								return event;
								break;
							case MidiEvents.EVENT_MIDI_CHANNEL_AFTERTOUCH:
								return event;
								break;
							case MidiEvents.EVENT_MIDI_PITCH_BEND:
								event.param2=stream.readUint8();
								return event;
								break;
							default:
								if(strictMode)
									throw new Error(stream.pos()+' Unknown midi event type '
										+'('+midiEventType.toString(16)+').');
								return event;
								break;
						}
				}
			}
		};
	};

	return MidiEvents;

});})(this,typeof define === 'function' && define.amd ?
	// AMD
	define :
	// NodeJS
	(typeof exports === 'object'?function (name, deps, factory) {
		var root=this;
		if(typeof name === 'object') {
			factory=deps; deps=name;
		}
		module.exports=factory.apply(this, deps.map(function(dep){
			return require(dep);
		}));
	}:
	// Global
	function (name, deps, factory) {
		var root=this;
		if(typeof name === 'object') {
			factory=deps; deps=name;
		}
		this.MidiEvents=factory.apply(this, deps.map(function(dep){
			return root[dep.substring(dep.lastIndexOf('/')+1)];
		}));
	}.bind(this)
	)
);
