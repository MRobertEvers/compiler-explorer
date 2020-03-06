// Copyright (c) 2016, Matt Godbolt
// All rights reserved.
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are met:
//
//     * Redistributions of source code must retain the above copyright notice,
//       this list of conditions and the following disclaimer.
//     * Redistributions in binary form must reproduce the above copyright
//       notice, this list of conditions and the following disclaimer in the
//       documentation and/or other materials provided with the distribution.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
// AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
// IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
// ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
// LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
// CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
// SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
// INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
// CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
// ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
// POSSIBILITY OF SUCH DAMAGE.
const path = require('path');
const fs = require('fs');
const BaseCompiler = require('../base-compiler');
const AsmParser = require('../asm-parser');

function trim(str, chars) {
    const charSet = new Set(chars);
    var start = 0, 
        end = str.length;

    while(start < end && charSet.has(str[start]))
        ++start;

    while(end > start && charSet.has(str[end-1]))
        --end;

    return (start > 0 || end < str.length) ? str.substring(start, end) : str;
}

class IARAsmParser extends AsmParser {
    processAsm(asmResult, filters) {
        let currentSourceLine = 0;
        let asm = [];
        for( let asmLine of asmResult ) {
            let asmText = asmLine.text;
            let trimLine = asmText.trim();
            
            if( trimLine.startsWith('\\') ) {
                if( currentSourceLine != 0 ) {
                    trimLine = trimLine.substr(1).trim();
                    if( trimLine.startsWith("0x") ) {
                        // Instruction.
                        let splits = trimLine.split(' ').filter(val => val);
                        splits = splits.slice(2);
                        splits[0] = splits[0].padEnd(6, ' ');
                        trimLine = splits.join(' ');
                        asmLine.text = `\t${trimLine}`;
                    }
                    else if( !trimLine.startsWith('In') ){
                        // Label
                        asmLine.text = trimLine;
                    }
                    else {
                        continue;
                    }
                    asmLine.source = {
                        file: null,
                        line: currentSourceLine
                    }
                    asm.push(asmLine);
                }
            }
            else {
                let firstSpace = trimLine.indexOf(' ');
                if( firstSpace > 0 ) {
                    let testIfNum = trimLine.substr(0, firstSpace);
                    if( !isNaN(testIfNum) ) {
                        trimLine = trimLine.substr(firstSpace).trim();
                        if( !trimLine.startsWith('//') && !trimLine.startsWith('/*') && !trimLine.startsWith('*') ) {
                            currentSourceLine = Number.parseInt(testIfNum);
                        }
                        else {
                            currentSourceLine = 0;
                        }
                    }
                }
            }
        }

        return { asm, labelDefinitions: null };
    }
}


class IARCompiler extends BaseCompiler {
    constructor(compilerProps, env) {
        super(compilerProps, env);

        this.defaultAsm = this.asm;
        this.asm = new IARAsmParser(this._compilerProps);

    }
    optionsForFilter(filters, outputFilename) {
        const fname = this.filename(outputFilename);
        let options = ['-o', fname, '-lC', path.dirname(fname)];
        return options;
    }

    getOutputFilename(dirPath, outputFilebase) {
        // NB keep lower case as ldc compiler `tolower`s the output name
        return path.join(dirPath, `${outputFilebase}.o`);
    }

    async execPostProcess(result, postProcesses, outputFilename, maxSize) {
        const ppFile = outputFilename.replace('.o', '.lst');
        const contents = fs.readFileSync(ppFile);
        result.asm = contents.toString();

        // const lines = result.asm;
        // let currentLineData = 0;
        // for( let line of lines ) {
        //     line = line.strip();
        //     if( line.startsWith('\\') ) {
        //         if( currentLineData < 1 ) {
        //             // Discard line. Not sure what this is.
        //         }
        //         else {

        //         }
        //     }

        //     let firstSpace = line.indexOf(' ');
        //     if( firstSpace > 0 ) {
        //         let testIfNum = line.substr(0, firstSpace);
        //         if( !isNaN(testIfNum) ) {
        //             const lineIndex = Number.parseInt(line.substr(0, firstSpace));
        //         }
        //     }
        // }

        return result;
    }

    processAsm(result, filters) {
        let { asm, labelDefinitions } = this.defaultAsm.process(result.asm, filters);

        let res = this.asm.process(asm, filters);
        return res;
    }

}

module.exports = IARCompiler;
