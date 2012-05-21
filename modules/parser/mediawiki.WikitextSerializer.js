/**
 * Serializes a chunk of tokens or an HTML DOM to MediaWiki's wikitext flavor.
 * 
 * @class
 * @constructor
 * @param options {Object} List of options for serialization
 */
WikitextSerializer = function( options ) {
	this.options = $.extend( {
		// defaults
	}, options || {} );
};

var WSP = WikitextSerializer.prototype;

WSP.defaultOptions = {
	needParagraphLines: false,
	listStack: [],
	lastHandler: null
};

var id = function( v ) { return function() { return v; }; };

WSP._listHandler = function( bullet, state, token ) {
	var bullets, res;
	var stack = state.listStack;
	if (stack.length === 0) {
		bullets = "\n" + bullet;
		res     = bullets;
	} else {
		var curList = stack[stack.length - 1];
		bullets = curList.bullets + bullet;
		curList.itemCount++;
		if (	// deeply nested list
				curList.itemCount > 2 ||
				// A nested list, not directly after the li
				( curList.itemCount > 1 &&
				! ( state.lastToken.constructor === TagTk && 
					state.lastToken.name === 'li') )) {
			res = bullets;
		} else {
			res = bullet;
		}
	}
	stack.push({ itemCount: 0, bullets: bullets});
	return res;
};

WSP._listEndHandler = function( state, token ) {
	state.listStack.pop();
	// FIXME: insert a newline after a list block is closed (the next token is
	// no list token).
	return '';
};

WSP._listItemHandler = function ( state, token ) { 
	//console.warn( JSON.stringify( state.listStack ) );
	var stack = state.listStack;
	state.needParagraphLines = true;
	if (stack.length === 0) {
		return '';
	} else {
		var curList = stack[stack.length - 1];
		curList.itemCount++;
		// > 1 ==> consecutive list items
		return ( curList.itemCount > 1 ) ? curList.bullets : '';
	}
};

WSP._serializeTableTag = function ( symbol, optionEndSymbol, state, token ) {
	if ( token.attribs.length ) {
		return '\n' + symbol + ' ' + 
			WSP._serializeAttributes( token.attribs ) + optionEndSymbol;
	} else {
		return '\n' + symbol;
	}
};

WSP._linkHandler =  function( state, token ) {
	return '[[';
	// TODO: handle internal/external links etc using RDFa and dataAttribs
	// Also convert unannotated html links to external wiki links for html
	// import. Might want to consider converting relative links without path
	// component and file extension to wiki links.
	//if ( rtinfo.type === 'wikilink' ) {
	//	return '[[' + rtinfo.target + ']]';
	//} else {
	//	// external link
	//	return '[' + rtinfo.
};
WSP._linkEndHandler =  function( state, token ) {
	return ']]';
};

WSP.tagToWikitext = {
	body: {},
	b: { start: id("'''"), end: id("'''") },
	i: { start: id("''"), end: id("''") },
	ul: { 
		start: WSP._listHandler.bind( null, '*' ),
		end: WSP._listEndHandler 
	},
	ol: { 
		start: WSP._listHandler.bind( null, '#' ),
		end: WSP._listEndHandler
	},
	dl: { 
		start: WSP._listHandler.bind( null, '' ), 
		end: WSP._listEndHandler
	},
	li: { start: WSP._listItemHandler },
	// XXX: handle single-line vs. multi-line dls etc
	dt: { start: id(";") },
	dd: { start: id(":") },
	// XXX: handle options
	table: { 
		start: WSP._serializeTableTag.bind(null, "{|", ''), 
		end: id("\n|}") 
	},
	tbody: {},
	th: { start: WSP._serializeTableTag.bind(null, "!", ' |')  },
	// XXX: omit for first row in table.
	tr: { start: WSP._serializeTableTag.bind(null, "|-", ' |') },
	td: { start: WSP._serializeTableTag.bind(null, "|", ' |') },
	caption: { start: WSP._serializeTableTag.bind(null, "|+", ' |') },
	p: { 
		start: function( state, token ) {
			if (state.needParagraphLines) {
				return "\n\n";
			} else {
				state.needParagraphLines = true;
				return '';
			}
		}
	},
	hr: { start: id("\n----"), end: id("\n") },
	h1: { start: id("\n="), end: id("=\n") },
	h2: { start: id("\n=="), end: id("==\n") },
	h3: { start: id("\n==="), end: id("===\n") },
	h4: { start: id("\n===="), end: id("====\n") },
	h5: { start: id("\n====="), end: id("=====\n") },
	h6: { start: id("\n======"), end: id("======\n") },
	pre: { start: id("<pre>"), end: id("</pre>") },
	a: { start: WSP._linkHandler, end: WSP._linkEndHandler }
};


WSP._serializeAttributes = function ( attribs ) {
	var out = [];
	for ( var i = 0, l = attribs.length; i < l; i++ ) {
		var kv = attribs[i];
		if (kv.k.length) {
			if ( kv.v.length ) {
				out.push( kv.k + '=' + 
						'"' + kv.v.replace( '"', '&quot;' ) + '"');
			} else {
				out.push( kv.k );
			}
		} else if ( kv.v.length ) {
			// not very likely..
			out.push( kv.v );
		}
	}
	// XXX: round-trip optional whitespace / line breaks etc
	return out.join(' ');
};
	

/**
 * Serialize a chunk of tokens
 */
WSP.serializeTokens = function( tokens, chunkCB ) {
	var state = $.extend({}, this.defaultOptions, this.options),
		i, l;
	if ( chunkCB === undefined ) {
		var out = [];
		chunkCB = out.push.bind(out);
		for ( i = 0, l = tokens.length; i < l; i++ ) {
			this._serializeToken( state, chunkCB, tokens[i] );
		}
		return out;
	} else {
		for ( i = 0, l = tokens.length; i < l; i++ ) {
			this._serializeToken( state, chunkCB, tokens[i] );
		}
	}
};


/**
 * Serialize a token.
 */
WSP._serializeToken = function ( state, chunkCB, token ) {
	state.lastToken = state.curToken;
	state.curToken = token;
	var handler;
	switch( token.constructor ) {
		case TagTk:
		case SelfclosingTagTk:
			handler = this.tagToWikitext[token.name];
			if ( handler && handler.start ) {
				chunkCB( handler.start( state, token ) );
			}
			break;
		case EndTagTk:
			handler = this.tagToWikitext[token.name];
			if ( handler && handler.end ) {
				chunkCB( handler.end( state, token ) );
			}
			break;
		case String:
			chunkCB( token );
			break;
		case CommentTk:
			chunkCB( '<!--' + token.value + '-->' );
			break;
		case NlTk:
			chunkCB( '\n' );
			break;
		case EOFTk:
			break;
		default:
			console.warn( 'Unhandled token type ' + JSON.stringify( token ) );
			break;
	}
};

/**
 * Serialize an HTML DOM document.
 */
WSP.serializeDOM = function( node, chunkCB ) {
	var state = $.extend({}, this.defaultOptions, this.options);
	if ( ! chunkCB ) {
		var out = [];
		chunkCB = out.push.bind( out );
		this._serializeDOM( node, chunkCB, state );
		return out.join('');
	} else {
		this._serializeDOM( node, chunkCB, state );
	}
};

/**
 * Internal worker. Recursively serialize a DOM subtree by creating tokens and
 * calling _serializeToken on each of these.
 */
WSP._serializeDOM = function( node, chunkCB, state ) {
	// serialize this node
	switch( node.nodeType ) {
		case Node.ELEMENT_NODE:
			//console.warn( node.nodeName.toLowerCase() );
			var children = node.childNodes,
				name = node.nodeName.toLowerCase(),
				handler = this.tagToWikitext[name];
			if ( handler ) {
				var tkAttribs = this._getDOMAttribs(node.attributes),
					tkRTInfo = this._getDOMRTInfo(node.attributes);

				this._serializeToken( state, chunkCB, 
						new TagTk( name, tkAttribs, tkRTInfo ) );
				for ( var i = 0, l = children.length; i < l; i++ ) {
					// serialize all children
					this._serializeDOM( children[i], chunkCB, state );
				}
				this._serializeToken( state, chunkCB, 
						new EndTagTk( name, tkAttribs, tkRTInfo ) );
			} else {
				console.warn( 'Unhandled element: ' + node.outerHTML );
			}
			break;
		case Node.TEXT_NODE:
			this._serializeToken( state, chunkCB, node.data );
			break;
		case Node.COMMENT_NODE:
			this._serializeToken( state, chunkCB, new CommentTk( node.data ) );
			break;
		default:
			console.warn( "Unhandled node type: " + 
					node.outerHTML );
			break;
	}
};

WSP._getDOMAttribs = function( attribs ) {
	// convert to list fo key-value pairs
	var out = [];
	for ( var i = 0, l = attribs.length; i < l; i++ ) {
		var attrib = attribs.item(i);
		if ( attrib.name !== 'data-mw' ) {
			out.push( { k: attrib.name, v: attrib.value } );
		}
	}
	return out;
};

WSP._getDOMRTInfo = function( attribs ) {
	if ( attribs['data-mw'] ) {
		return JSON.parse( attribs['data-mw'].value || '{}' );
	} else {
		return {};
	}
};

// Quick HACK: define Node constants locally
// https://developer.mozilla.org/en/nodeType
var Node = {
	ELEMENT_NODE: 1,
    ATTRIBUTE_NODE: 2,
    TEXT_NODE: 3,
    CDATA_SECTION_NODE: 4,
    ENTITY_REFERENCE_NODE: 5,
    ENTITY_NODE: 6,
    PROCESSING_INSTRUCTION_NODE: 7,
    COMMENT_NODE: 8,
    DOCUMENT_NODE: 9,
    DOCUMENT_TYPE_NODE: 10,
    DOCUMENT_FRAGMENT_NODE: 11,
    NOTATION_NODE: 12
};


if (typeof module == "object") {
	module.exports.WikitextSerializer = WikitextSerializer;
}
