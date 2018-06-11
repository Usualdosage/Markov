// Builds a Markov chain using an Elastic Search data set and query result. This work initially started
// after reviewing Jason Bury's article "Using Javascript and Markov Chains to Generate Text" available at 
// http://www.soliantconsulting.com/blog/2013/02/draft-title-generator-using-markov-chains. Although little
// of that work remains (array randomizer is about it), his work inspired me to create this, so shout out
// to him. Other functions are used with permission and credited where due.
// All other work is (c) Matthew Martin (The Usual Dosage) December 2013.

$(function () {

    // Sentences should not end with these. Use these to further refine the Markov chain.
    var end_noise_words = ["for", "and", "nor", "or", "but", "the", "an", "a", "be", "i"];

    // Past tense words should not start sentences (e.g. "Ended before the apocalypse" makes an improper sentence).
    var start_noise_suffixes = ["ed", "came", "been"];

    // Characters that will be removed from tokenized words
    var regex = /[^a-zA-Z ]+/g;

    // See if we have cached the results
    var dict = $.jStorage.get("markov_chain");

    // Nope, query Elastic Search
    if (!dict) {

        dict = [];

        var phrases = [];

        // Populate the "phrases" array from an Elastic Search query
        var query = { "query": { "bool": { "must": [{ "match_all": {} }] } }, "from": 0, "size": 2000 };

        $.ajax({
            url: "http://192.168.144.223:9200/markov/_search",
            type: 'POST',
            dataType: 'json',
            async: false,
            data: JSON.stringify(query),
            success: function (response) {
                $.each(response.hits.hits, function (i, item) {
                    phrases.push(item._source.sentence);
                });
            }
        });
        
        // Scope length locally so we aren't constantly checking array length
        var plen = phrases.length;

        // Start building the Markov chain. This loop construct is an example of what I refer to as a "Google"
        // loop. It's efficient because it scopes "phrase" in the construct, and automatically gets the index
        // so another variable declaration is not required.
        for (var i = 0, phrase; phrase = phrases[i], i < plen; i++) {
            var words = phrase.replace('  ', ' ').split(' ');

            // Scope length locally so we aren't constantly checking array length
            var len = words.length;

            for (var x = 0; x < len; x++) {
                // Peek to stay in bounds
                if ((x + 2) < len) {

                    // Break words into word pairs, with the value being the word following the pair
                    var key_pair = words[x] + ' ' + words[x + 1];
                    var value = words[x + 2];

                    // Ensure we have valid data
                    if (key_pair && value) {

                        // Normalize the string and remove punctuation
                        key_pair = key_pair.trim().toLowerCase().replace(regex, "");
                        value = value.trim().toLowerCase().replace(regex, "");

                        // Make sure we still have data after normalizing
                        if (key_pair && value) {

                            // Find the key in the array (if it exists)
                            var obj = $.grep(dict, function (obj) { return obj.key === key_pair; });

                            if (obj.length === 0) // Doesn't exist, add
                            {
                                dict.push({ key: key_pair, value: [value] });
                            }
                            else // Add to the value array
                            {
                                // Some keywords are reserved for functions, so make sure we don't have a collision here
                                if (typeof dict[key_pair] !== 'function') {
                                    try {
                                        if ($.inArray(value, obj[0].value) === -1) {
                                            obj[0].value.push(value)
                                        }
                                    }
                                    catch (err) {
                                        throw (err);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Cache it so we don't have to keep hammering the search server
        $.jStorage.set("markov_chain", dict);
    }

    // Create the Markov chain and connect it to an anonymous function. This work is based on the technique 
    // described by user "Nocker" on Stack Overflow. http://stackoverflow.com/questions/5306729/how-do-markov-chain-chatbots-work
    var generate_sentence = function (min_length) {
        var sentence = [];

        // Declare vars
        var i = 0;
        var pair;
        var ending = "ed";
        var rndval;
        
        // Get an item to seed the list that doesn't end in our start_noise_suffixes
        while ($.inArray(ending, start_noise_suffixes) > -1) {

            i = Math.floor(dict.length * Math.random());
            pair = dict[i];
            rndval = pair.value.random();
            ending = "";

            // Scope length locally so we aren't constantly checking array length
            var start_len = start_noise_suffixes.length;
            for (var j = 0, suffix; suffix = start_noise_suffixes[j], j < start_len; j++) {
                // If it ends with the suffix, we have to keep going
                if (rndval.endsWith(suffix)) {
                    ending = suffix;
                }
            }
        }

        // Capitalize "I"
        if (pair.key === "i")
            pair.key = pair.key.toUpperCase();

        if (rndval === "i")
            rndval = rndval.toUpperCase();

        // Add to the sentence
        sentence.push([pair.key + ' ' + rndval]);

        for (var x = 1, newpair; newpair = dict[i + x], x <= min_length; x++) {
            // Grab a random value again
            var val = newpair.value.random();

            if (val === "i")
                val = val.toUpperCase();

            sentence.push(val);
        }

        // Append an ending that is not a noise word. Seed with "the" to force a new random.
        rndval = "the";

        // End the sentence with something that isn't a noise word
        while ($.inArray(rndval, end_noise_words) > -1) {
            i = Math.floor(dict.length * Math.random());
            pair = dict[i];
            rndval = pair.value.random();
        }

        sentence.push(rndval);

        // Tidy it up
        return (sentence.join(' ').capitalizeFirst()) + ".";
    };

    // ======================
    // Prototypes
    // ======================

    // Array choice randomizer
    Array.prototype.random = function () {
        var i = Math.floor(this.length * Math.random());
        return this[i];
    }

    // Thanks to Steve Harrison for the idea. Converted into a prototype by me.
    // http://stackoverflow.com/questions/1026069/capitalize-the-first-letter-of-string-in-javascript
    String.prototype.capitalizeFirst = function () {
        return this.charAt(0).toUpperCase() + this.slice(1);
    };

    // Prototype to check if a string ends with a suffix. Thanks to chakrit.
    // http://stackoverflow.com/questions/280634/endswith-in-javascript
    String.prototype.endsWith = function (suffix) {
        return this.indexOf(suffix, this.length - suffix.length) !== -1;
    };

    // Wire up click event
    $('#generate').on('click', function () {
        var title = generate_sentence(10 + Math.floor(3 * Math.random()));
        $('#generated_title').html("<span class='quote'>&ldquo;</span>" + title + "<span class='quote'>&rdquo;</span>");
    });

    // Clear out the jstorage cache
    $('#dump_cache').on('click', function () {
        $.jStorage.flush();
        alert("Cache cleared.");
    });

    // Put the initial sentence in
    var title = generate_sentence(10 + Math.floor(3 * Math.random()));
    $('#generated_title').html("<span class='quote'>&ldquo;</span>" + title + "<span class='quote'>&rdquo;</span>");
});
