'use strict';

/* global describe, it */

require('../../core-upgrade.js');
require("chai").should();
var ParsoidConfig = require('../../lib/config/ParsoidConfig.js').ParsoidConfig;
var DU = require('../../lib/utils/DOMUtils.js').DOMUtils;
var helpers = require('./test.helpers.js');

// FIXME: MWParserEnvironment.getParserEnv and switchToConfig both require
// mwApiMap to be setup. This forces us to load WMF config. Fixing this
// will require some changes to ParsoidConfig and MWParserEnvironment.
var parsoidConfig = new ParsoidConfig(null, { loadWMF: true, defaultWiki: 'enwiki' });
var parse = function(src, options) {
	return helpers.parse(parsoidConfig, src, options).then(function(ret) {
		return ret.doc;
	});
};

var serialize = helpers.serialize.bind(null, parsoidConfig);

// These are regression specs for when we fix bugs that cannot be easily
// verified with the parser tests framework
describe('Regression Specs', function() {

	// Wikilinks use ./ prefixed urls. For reasons of consistency,
	// we should use a similar format for internal cite urls.
	// This spec ensures that we don't inadvertently break that requirement.
	it('should use ./ prefixed urls for cite links', function() {
		return parse('a [[Foo]] <ref>b</ref>').then(function(result) {
			result.body.querySelector(".mw-ref a").getAttribute('href').
				should.equal('./Main_Page#cite_note-1');
			result.body.querySelector("#cite_note-1 a").getAttribute('href').
				should.equal('./Main_Page#cite_ref-1');
		});
	});

	it('should prevent regression of T153107', function() {
		var wt = '[[Foo|bar]]';
		return parse(wt).then(function(result) {
			var origDOM = result.body;
			// This is mimicking a copy/paste in an editor
			var editedHTML = origDOM.innerHTML + origDOM.innerHTML.replace(/bar/, 'Foo');

			// Without selser, we should see [[Foo|Foo]], since we only normalize
			// for modified / new content, which requires selser for detection
			return serialize(DU.parseHTML(editedHTML), null, {}).then(function(editedWT) {
				editedWT.should.equal(wt + "\n\n[[Foo|Foo]]\n");
				// With selser, we should see [[Foo]]
				var options = {
					useSelser: true,
					pageSrc: wt,
					origDOM: origDOM,
				};
				return serialize(DU.parseHTML(editedHTML), null, options).then(function(editedWT) {
					editedWT.should.equal(wt + "\n\n[[Foo]]\n");
				});
			});
		});
	});

});
