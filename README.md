# Note upfront

## Auth credentials required
You need to ask win (at) westtoer.be a required api-key (id and secret) to consume this api directly (which is, by the way, not recommended).

## Recommended alternative
The data retrieved by this system is made availabe (together with data from other sources) through the Westtoer datahub at http://datahub.westtoer.be/ext/feeds/WIN/2.0/

Contact datahub (at) westtoer.be for more details and access to that.


# Install

This requires nodejs and npm to be installed.

Please, be a sport and run the typical 
```
npm install
```
before trying further, to avoid unnecessary frustration and disappointment.


# Usage

## Default dump

The default (no dump-specifications) dump:
```
nodejs dhubdump.js -o ~/feeds/WIN/2.0/ -i <<yourid>> -s <<yoursecret>>
```

is equivalent to:
```
nodejs dhubdump.js -o ~/feeds/WIN/2.0/ -i <<yourid>> -s <<yoursecret>> vocs products
```

meaning that it will combine those 2 dumps in one run.



## Products dump

```
nodejs dhubdump.js -o ~/feeds/WIN/2.0/ -i <<yourid>> -s <<yoursecret>> products
```
This will create the datahub LEVEL0 dump from the WIN 2.0 tdms.
The created dump files are named and organized as such:

```
[ROOT]/
  <<type>>-<<pubstate>>.<<format>>
  <<type>>-<<pubstate>>-<<period-from-to>>.<<format>>
  bychannel/
    <<channel>>/
        <<channel>>.<<format>>
        <<channel>>-all-<<period-to-from>>.<<format>>
  bytourtype/
    allchannels-<<tourtype>>.<<format>>
    allchannels-<<period-from>>.<<format>>
  bycity/
    <<municipality>>/
      <<municipality>>-<<type>>-all.<<format>>
      <<municipality>>-<<type>>-<<pubstate>>.<<format>>
```

In this structure the following value-replacements can occur:

key             | possibe values     | meaning
----------------|--------------------|--------
 ```<<type>>```         |...| type of touristic item in the dump
    | accomodation       |   places to stay
    | permanent_offering |   POI and attractions
    | reca               |   places to eat and drink
    | temporary_offering |   events 
    | mice               |   mice info
 ```<<pubstate>>```     |all, pub| publication states of the items in the dump
    | all                |   all items, ignoring their published state
    | pub                |   only items in the published state
 ```<<period-from>>```|week, day + YYYYMMDD startdate| indicating a subset of last-modified items in the indicated (by name and boundaries) period of time, from date is inclusive, end date is open to the moment of dump-generation -- this assumes to run these around, but distinctly before the end of the day.
    | week-YYYYMMDD-current |   7 day period, items updated during the week leading up to today
    | day-YYYYMMDD-current  |   1 day period, items updated since yesterday up to now
 ```<<format>>```       |xml,  json| file format of the dump
    | xml                |   eXtensible Markup Language
    | json               |   JavaScript Object Notation
 ```<<channel>>```      |...| publication-channel on which the contained items in the dump should be published
 ```<<tourtype>>```     |...| one of +80 distinct types from touristic classification (see taxonomy produced by the vocs dump)
 ```<<municipality>>``` |...| the municipality on which the dataset is filtered
 
The content of these files is descibed [here](https://goo.gl/0O1BWC)


## Vocabulary dump
```
nodejs dhubdump.js -o ~/feeds/WIN/2.0/ -i <<yourid>> -s <<yoursecret>> vocs
```

This dump produces:
```
[ROOT]/
  reference/
    taxonomies.<<format>>
```

## Samples dump
```
nodejs dhubdump.js -o ~/feeds/WIN/2.0/ -i <<yourid>> -s <<yoursecret>> samples
```

This dump produces:
```
[ROOT]/
  samples/
    sample-<<id>>.<<format>>
```

Containing export-files holding single-item information, identified by their id.
The content of these files follows the previsously mentioned 'products' layout.


## Claims dump
```
nodejs dhubdump.js -o ~/feeds/WIN/2.0/ -i <<yourid>> -s <<yoursecret>> claims
```
This will produce the files claims.xml and claims.json containing the infromation about the claims in the WIN



## Statistics dump
```
nodejs dhubdump.js -o ~/feeds/WIN/2.0/ -i <<yourid>> -s <<yoursecret>> stats
```
This will produce the files stats.xml and stats.json containing the statistical data in the WIN



## Splitting json files

Adding this switch

```
-j <<max-number-records>>
```

Will force all json-array files to be split into separate files (parts) each containing maximum the specified number of elements.
If the original json already contains less, no splitting will be provided.

This fetaure is to better support consumers of the dump that don't use a json streaming (or pull) parser.

With this swithch the following extra process goes on for every produced json file.

(only) If  **/path/some-name.json has more then N records
Then the dump will produce the folder:

```
    **/path/some-name/ with following contents:
    **/path/some-name/some-name-index.json en 
    **/path/some-name/some-name-part-00000.json 
       …
    **/path/some-name/some-name-part-00023.json 
```



## Known Limitations

Considering the wisdom from the [Jon Postel Robustness Principle](https://en.wikipedia.org/wiki/Robustness_principle) we strongly advise all client services of these files to be able to cope with these known limitations:

### Availability Limitation

The api service occasionally runs into internal performance issues, this will result in files not being available in the dump.
 
In the current state this leads to errors emitted during the run that look like this:

```
error reading uri [http://api.westtoer.tdms.acc.saga.be/api/v1/temporary_offering/?format=xml&access_token=***&size=9750] to stream - response.status == 500
```

The status could equally be 
* any other 50x - the 502 typically indicating the problem is rather at some intermediate proxy.
* or even more bare-bones netwerking issues (connectivity, dns resolution issues, ...)


If you didn't run the process yourself, but are just given access to the produced files, you should be able to grab the ```dhubdump-report.csv```.  That file lists the files it tried to produce, the query settings, the URI called and the status of that attempt.

Since producing this report is the last action of the dump-process its timestamp will tell you 
- when the dump-process last completed
- and in the odd occasion that it is smaller then that of the produced files: that a dump is currently in progress, or was killed prematurely (without being able to write the report, and thus update its lastmod-ts)


### Correctness Limitation

The dump-service currently does not check the "wellformed-ness" of the produced xml and json files. 

In other words it can easily be fooled (by a bad working api service in the back) to produce *xml or *json files that simply can't be parsed.

We advise using some linting techniques or other safety checks to verify this. On linux (or windows + cygwin) you can use

for XML
```
find path/to/root -type f -name \*xml | while read f; do out=$(xmllint --noout $f 2>&1); err=$?; oln=$(echo -n "${out}"|wc -c); if [ "${err}${oln}" -ne "00" ]; then echo "ERROR  XML FILE @ $f"; fi; done;
```
for JSON
```
find path/to/root -type f -name \*json | while read f; do cat $f | python -mjson.tool > /dev/null 2>&1; if [ "$?" -ne "0" ]; then >&2 echo "ERROR JSON FILE @ $f"; fi; done;
```

For convenience a version of the above linting is ran centrally on the datahub instance.  You should be able to grab the ```dhubdump-lintreport.txt```.  That file lists possibly faulty XML or JSON files in the dump.

### Content Limitation

The content captured in these dump files are eventually maintained by humans. Those, at times, fail too.  
In order to address possible errors in the content it is best to trace well (and communicate) what information (position by line-number or entity-id) you read from which file obtained at what time.

If at all possible be sure to let that kind of metadata ripple through your own application to be able to trace things back to the source.



#Dev

Ready to help out and delve in?
You might want to install mocha, and make sure all your contributions are accompanied by tests covering the addressed issues or new features.

```
npm install -g mocha
npm test
```

Individual tests are run with

```
mocha test/test-specific-name.js
```

Running the tests requires an id/secret pair (see above on how to obtain) - set those in test/client-settings.json (layout example in test/client-settings.json.example)
